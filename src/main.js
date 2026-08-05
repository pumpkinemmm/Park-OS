/* ================================================
   Park OS — 智慧园区多维监控大屏
   WebSocket 实时推送 + ECharts 图表 + AI 问答 + 声光告警
   ================================================ */

const $ = (s) => document.querySelector(s)
const fmt = (n) => n.toLocaleString('zh-CN')
const pct = (a, b) => ((a / b) * 100).toFixed(1) + '%'

// ==================== 数据存储 ====================

const alertedIds = new Set()
const store = {
  connected: false,
  stats: {
    devices: 1286, online: 1267, offline: 19,
    alertsToday: 23, alertsResolved: 18,
    energyToday: 4820, energyYesterday: 4979,
    visitorsToday: 1847, visitorsYesterday: 2103,
    parkingTotal: 860, parkingUsed: 623,
  },
  energyTrend: [],
  env: [],
  deviceTypeStats: [],
  alerts: [],
  diagnosis: [],
}

// ==================== WebSocket 客户端 ====================

let ws = null, wsReconnectTimer = null

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  try { ws = new WebSocket('ws://localhost:3001') } catch (_) { scheduleReconnect(); return }

  ws.onopen = () => {
    store.connected = true
    updateConnectionIndicator()
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  }

  ws.onmessage = (event) => {
    try {
      const d = JSON.parse(event.data)
      if (d.type !== 'iot_data') return
      if (d.stats) store.stats = d.stats
      if (d.energyTrend) store.energyTrend = d.energyTrend
      if (d.env) store.env = d.env
      if (d.deviceTypeStats) store.deviceTypeStats = d.deviceTypeStats
      if (d.alerts) store.alerts = d.alerts
      if (d.diagnosis) store.diagnosis = d.diagnosis
      refreshDashboard()
    } catch (_) {}
  }

  ws.onclose = () => { store.connected = false; updateConnectionIndicator(); scheduleReconnect() }
}

function scheduleReconnect() {
  if (wsReconnectTimer) return
  wsReconnectTimer = setTimeout(() => { wsReconnectTimer = null; connectWebSocket() }, 5000)
}

function updateConnectionIndicator() {
  const el = $('#wsIndicator')
  if (!el) return
  el.className = store.connected ? 'ws-indicator ws-connected' : 'ws-indicator ws-disconnected'
  el.title = store.connected ? 'WebSocket 已连接' : 'WebSocket 已断开'
}

// ==================== ECharts 图表 ====================

const chartInstances = {}
function getChart(id) {
  if (chartInstances[id]) return chartInstances[id]
  const dom = document.getElementById(id)
  if (!dom) return null
  return (chartInstances[id] = echarts.init(dom))
}
function disposeAllCharts() {
  Object.keys(chartInstances).forEach(k => { chartInstances[k]?.dispose(); delete chartInstances[k] })
}

function renderLineChart(domId, data) {
  const c = getChart(domId); if (!c || !data.length) return
  c.setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,20,35,0.92)', borderColor: '#1e3a5f', textStyle: { color: '#c8d6e5', fontSize: 12 } },
    legend: { data: ['能耗 (kWh)', '温度 (°C)', '湿度 (%)'], bottom: 0, textStyle: { color: '#8899aa', fontSize: 11 }, itemGap: 20 },
    grid: { left: 50, right: 55, top: 18, bottom: 38 },
    xAxis: { type: 'category', data: data.map(d => d.time), boundaryGap: false, axisLine: { lineStyle: { color: '#2a3a5c' } }, axisTick: { show: false }, axisLabel: { color: '#6b7d95', fontSize: 10, rotate: data.length > 16 ? 45 : 0 } },
    yAxis: [
      { type: 'value', name: 'kWh', nameTextStyle: { color: '#6b7d95', fontSize: 10 }, splitLine: { lineStyle: { color: '#1a2a40', type: 'dashed' } }, axisLabel: { color: '#6b7d95', fontSize: 10 } },
      { type: 'value', name: '°C / %', nameTextStyle: { color: '#6b7d95', fontSize: 10 }, splitLine: { show: false }, axisLabel: { color: '#6b7d95', fontSize: 10 } },
    ],
    series: [
      { name: '能耗 (kWh)', type: 'line', data: data.map(d => d.energy), smooth: true, symbol: 'none', lineStyle: { width: 2.5, color: '#4fc3f7' }, areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(79,195,247,0.25)'},{offset:1,color:'rgba(79,195,247,0.02)'}]) } },
      { name: '温度 (°C)', type: 'line', yAxisIndex: 1, data: data.map(d => d.temp), smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#ff8a65' } },
      { name: '湿度 (%)', type: 'line', yAxisIndex: 1, data: data.map(d => d.humidity), smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#81c784' } },
    ],
  }, true)
}

function renderPieChart(domId, data) {
  const c = getChart(domId); if (!c || !data.length) return
  c.setOption({
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,20,35,0.92)', borderColor: '#1e3a5f', textStyle: { color: '#c8d6e5', fontSize: 12 }, formatter: '{b}: {c} 台 ({d}%)' },
    legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { color: '#8899aa', fontSize: 11 }, itemGap: 12 },
    series: [{ type: 'pie', radius: ['52%', '78%'], center: ['38%', '50%'], itemStyle: { borderRadius: 3, borderColor: '#0f1629', borderWidth: 3 }, label: { show: true, position: 'inside', formatter: '{d}%', fontSize: 11, color: '#fff' }, emphasis: { label: { fontSize: 16, fontWeight: 'bold' }, scaleSize: 8 },
      data: data.map((d, i) => ({ value: d.total, name: d.name, itemStyle: { color: ['#4fc3f7','#81c784','#ffb74d','#e57373','#ba68c8'][i % 5] } })) }],
  }, true)
}

function renderHeatmap(domId, envData) {
  const c = getChart(domId); if (!c || !envData.length) return
  const metrics = ['PM2.5', 'CO₂', '温度', '湿度']
  const zones = envData.map(e => e.zone.split('·')[1] || e.zone)
  const heatData = []; envData.forEach((e, zi) => { heatData.push([zi, 0, e.pm25], [zi, 1, e.co2], [zi, 2, e.temp], [zi, 3, e.humidity]) })
  const maxes = [Math.max(...envData.map(e => e.pm25), 1), Math.max(...envData.map(e => e.co2), 1), Math.max(...envData.map(e => e.temp), 1), Math.max(...envData.map(e => e.humidity), 1)]
  const normalized = heatData.map(([zi, mi, val]) => [zi, mi, Math.round(val / maxes[mi] * 100)])
  c.setOption({
    tooltip: { backgroundColor: 'rgba(15,20,35,0.92)', borderColor: '#1e3a5f', textStyle: { color: '#c8d6e5', fontSize: 12 }, formatter: (p) => { const r = heatData.find(d => d[0]===p.data[0] && d[1]===p.data[1]); return `${zones[p.data[0]]}<br/>${metrics[p.data[1]]}: <b>${r?r[2]:'--'} ${['μg/m³','ppm','°C','%'][p.data[1]]}</b>` } },
    grid: { left: 90, right: 40, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: zones, axisLine: { lineStyle: { color: '#2a3a5c' } }, axisLabel: { color: '#8899aa', fontSize: 10, rotate: 20 } },
    yAxis: { type: 'category', data: metrics, axisLine: { lineStyle: { color: '#2a3a5c' } }, axisLabel: { color: '#8899aa', fontSize: 10 } },
    visualMap: { min: 0, max: 100, orient: 'vertical', right: 0, top: 'center', textStyle: { color: '#6b7d95', fontSize: 10 }, inRange: { color: ['#0a1628','#0d3b66','#1a6b9e','#28aae1','#4fc3f7','#81d4fa'] } },
    series: [{ type: 'heatmap', data: normalized, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(79,195,247,0.6)' } } }],
  }, true)
}

// ==================== KPI 卡片 ====================

function renderKpiCards() {
  const s = store.stats
  const vc = s.visitorsYesterday > 0 ? ((s.visitorsToday - s.visitorsYesterday) / s.visitorsYesterday * 100).toFixed(1) : '0'
  const vt = +vc >= 0 ? '▲' : '▼', vcls = +vc >= 0 ? 'trend-up' : 'trend-down'
  const ar = s.alertsToday - s.alertsResolved
  return `
    <div class="kpi-card"><div class="kpi-icon" style="background:rgba(79,195,247,.15);color:#4fc3f7">📡</div><div class="kpi-body"><div class="kpi-label">设备总数 / 在线率</div><div class="kpi-value">${fmt(s.devices)} <span class="kpi-rate">${pct(s.online, s.devices)}</span></div><div class="kpi-sub"><span class="dot online"></span>在线 ${fmt(s.online)} &nbsp;<span class="dot offline"></span>离线 ${s.offline}</div></div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:rgba(129,199,132,.15);color:#81c784">👥</div><div class="kpi-body"><div class="kpi-label">今日访客</div><div class="kpi-value">${fmt(s.visitorsToday)} <span class="kpi-unit">人次</span></div><div class="kpi-sub"><span class="${vcls}">${vt} ${Math.abs(+vc)}%</span> 较昨日</div></div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:rgba(229,115,115,.15);color:#e57373">🚨</div><div class="kpi-body"><div class="kpi-label">今日告警</div><div class="kpi-value kpi-danger">${s.alertsToday}</div><div class="kpi-sub">已处理 <span class="trend-up">${s.alertsResolved}</span> · 剩余 <span class="trend-down">${ar}</span></div></div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:rgba(255,183,77,.15);color:#ffb74d">⚡</div><div class="kpi-body"><div class="kpi-label">今日能耗</div><div class="kpi-value">${fmt(s.energyToday)} <span class="kpi-unit">kWh</span></div><div class="kpi-sub">昨日 ${fmt(s.energyYesterday)} kWh</div></div></div>
    <div class="kpi-card"><div class="kpi-icon" style="background:rgba(186,104,200,.15);color:#ba68c8">🅿️</div><div class="kpi-body"><div class="kpi-label">车位占用率</div><div class="kpi-value">${pct(s.parkingUsed, s.parkingTotal)}</div><div class="kpi-sub">${fmt(s.parkingUsed)} / ${fmt(s.parkingTotal)} 个</div></div></div>
  `
}

// ==================== 故障诊断 ====================

function renderDiagnosisPanel() {
  if (!store.diagnosis.length) return `<div class="diagnosis-empty">✅ 当前所有区域运行正常，未检测到异常指标</div>`
  return `<div class="diagnosis-list">${store.diagnosis.map(d => `
    <div class="diagnosis-card diag-${d.severity}">
      <div class="diag-header"><span class="diag-zone">📍 ${d.zone}</span><span class="diag-tag diag-tag-${d.severity}">${{danger:'紧急',warn:'警告'}[d.severity]||d.severity}</span></div>
      <div class="diag-body">
        <div class="diag-metric"><span class="diag-name">${d.metric}</span><span class="diag-value">${d.value} ${d.unit}</span><span class="diag-threshold">阈值: ${d.threshold}</span></div>
        <div class="diag-cause"><span class="diag-cause-label">🔍 诊断:</span> ${d.cause}</div>
        <div class="diag-suggestion"><span class="diag-sug-label">💡 建议:</span> ${d.suggestion}</div>
      </div></div>`).join('')}</div>`
}

// ==================== AI 问答引擎 ====================

function generateSummary() {
  const s = store.stats
  const danger = store.env.filter(e => e.status === 'danger')
  const warn = store.env.filter(e => e.status === 'warn')
  const maxPM25 = store.env.reduce((a, b) => a.pm25 > b.pm25 ? a : b, store.env[0] || { zone: '--', pm25: 0 })
  const t = store.energyTrend, le = t[t.length - 1], pe = t[t.length - 2]
  const et = pe ? ((le.energy - pe.energy) / pe.energy * 100).toFixed(1) : '0'
  let s2 = `📋 **实时概览**：园区共 ${fmt(s.devices)} 台设备，在线率 ${pct(s.online, s.devices)}。`
  if (danger.length) s2 += `\n⚠️ ${danger.map(z => z.zone.split('·')[1]).join('、')} 处于**危险**状态。`
  if (warn.length) s2 += `\n🔶 ${warn.map(z => z.zone.split('·')[1]).join('、')} 存在预警。`
  s2 += `\n📊 PM2.5 最高：${maxPM25.zone.split('·')[1] || '--'}（${maxPM25.pm25} μg/m³）。`
  s2 += `\n⚡ 能耗趋势：${+et >= 0 ? '↑' : '↓'} ${Math.abs(+et)}%。`
  s2 += `\n🚨 待处理告警：${store.alerts.filter(a => a.status === 'pending').length} 条。`
  return s2
}

function aiQuery(text) {
  const q = text.trim(), s = store.stats
  if (/危险|异常/.test(q)) {
    const da = store.env.filter(e => e.status === 'danger'), wa = store.env.filter(e => e.status === 'warn')
    let a = `📋 **异常区域分析**\n\n`
    if (da.length) a += `🔴 危险：\n${da.map(e => `  • ${e.zone}：PM2.5=${e.pm25} CO₂=${e.co2} 温度=${e.temp}°C`).join('\n')}\n\n🔍 **归因**：${da[0].pm25 > 55 ? 'PM2.5 严重超标' : ''}${da[0].co2 > 850 ? 'CO₂ 浓度过高，通风可能失效' : '多项指标超标，可能存在级联故障'}\n`
    if (wa.length) a += `\n🔶 预警：\n${wa.map(e => `  • ${e.zone}：${e.humidity > 65 ? '湿度过高' : e.temp > 28 ? '温度偏高' : e.pm25 > 40 ? 'PM2.5 偏高' : 'CO₂ 偏高'}`).join('\n')}\n`
    if (!da.length && !wa.length) a += `✅ 所有区域运行正常。\n`
    a += `\n💡 **建议**：优先处理 danger 区域，检查通风/制冷/除尘设备。`
    return a
  }
  if (/能耗|用电/.test(q)) {
    const pk = store.energyTrend.reduce((a, b) => a.energy > b.energy ? a : b), vl = store.energyTrend.reduce((a, b) => a.energy < b.energy ? a : b)
    return `📋 **能耗分析**\n\n• 今日：${fmt(s.energyToday)} kWh（昨日 ${fmt(s.energyYesterday)} kWh）\n• 峰值：${pk.energy} kWh（${pk.time}）\n• 谷值：${vl.energy} kWh（${vl.time}）\n\n🔍 峰值与生产/办公活动高峰吻合。\n💡 可在谷时安排高能耗设备运行。`
  }
  if (/PM2\.5|pm25|空气质量/.test(q)) {
    const w = store.env.reduce((a, b) => a.pm25 > b.pm25 ? a : b)
    return `📋 **PM2.5 分析**\n\n• 最高：${w.zone}（${w.pm25} μg/m³）\n• 状态：${w.status === 'danger' ? '🔴 危险' : w.status === 'warn' ? '🔶 预警' : '✅ 正常'}\n\n🔍 ${w.pm25 > 55 ? '浓度严重超标' : w.pm25 > 40 ? '浓度偏高需关注' : '在安全范围内'}\n💡 检查空气净化设备，加强新风过滤。`
  }
  if (/温度|高温/.test(q)) {
    const h = store.env.reduce((a, b) => a.temp > b.temp ? a : b)
    return `📋 **温度分析**\n\n• 最高：${h.zone}（${h.temp}°C）\n• 状态：${h.temp > 30 ? '🔴 危险' : h.temp > 28 ? '🔶 预警' : '✅ 正常'}\n\n🔍 ${h.temp > 30 ? '制冷系统能力不足或散热异常' : '温度可控需持续关注'}\n💡 检查空调机组和散热设备。`
  }
  if (/设备|在线|离线/.test(q)) {
    return `📋 **设备状态**\n\n• 总数：${fmt(s.devices)} · 在线：${fmt(s.online)}（${pct(s.online, s.devices)}）· 离线：${s.offline}\n\n类型分布：\n${store.deviceTypeStats.map(d => `  • ${d.name}：${d.online}/${d.total}（${pct(d.online, d.total)}）`).join('\n')}\n\n💡 离线设备需排查网络和供电。`
  }
  if (/告警/.test(q)) {
    const lv = {}; store.alerts.forEach(a => lv[a.level] = (lv[a.level] || 0) + 1)
    return `📋 **告警统计**\n\n• 紧急：${lv.danger || 0} · 警告：${lv.warn || 0} · 提示：${lv.info || 0}\n• 待处理：${store.alerts.filter(a => a.status === 'pending').length}\n\n最近：\n${store.alerts.slice(0, 3).map(a => `  • ${a.time} [${a.label}] ${a.device}`).join('\n')}\n\n💡 优先处理紧急告警。`
  }
  if (/JSON|原始|导出/.test(q)) return '```json\n' + JSON.stringify({ stats: store.stats, env: store.env, deviceTypeStats: store.deviceTypeStats, diagnosis: store.diagnosis, alerts: store.alerts.slice(0, 10) }, null, 2) + '\n```'
  return generateSummary() + `\n\n💡 可提问："哪个区域最危险"、"能耗趋势"、"PM2.5最高"、"设备在线率"、"告警汇总"、"导出JSON"。`
}

// ==================== 园区 2D 地图 ====================

function renderMapPanel() {
  // 根据数据查找区域状态
  const getStatus = (zoneKey) => {
    const e = store.env.find(v => v.zone.includes(zoneKey))
    return e ? e.status : 'good'
  }
  const getColor = (zoneKey) => {
    const s = getStatus(zoneKey)
    return s === 'danger' ? '#e57373' : s === 'warn' ? '#ffb74d' : '#4fc3f7'
  }
  const getPulse = (zoneKey) => getStatus(zoneKey) === 'danger' ? ' building-pulse' : ''

  // 获取区域简称对应的数据
  const zd = {}
  store.env.forEach(e => {
    const key = e.zone.split('·')[0]  // A区, B区, ...
    zd[key] = e
  })

  // 生成楼宇 tooltip 文本
  const tip = (key) => {
    const d = zd[key]
    if (!d) return key
    return `${d.zone}\\n🌡 ${d.temp}°C  💧 ${d.humidity}%\\n🫁 PM2.5 ${d.pm25}  💨 CO₂ ${d.co2}`
  }

  return `
  <svg class="campus-map" viewBox="0 0 800 460" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="shadow"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.3"/></filter>
    </defs>

    <!-- 背景草地 -->
    <rect x="0" y="0" width="800" height="460" fill="#0a0f18" rx="12"/>
    <rect x="10" y="10" width="780" height="440" fill="#141f2e" rx="10" stroke="#1e3040" stroke-width="1.5"/>

    <!-- 绿化带 -->
    <ellipse cx="130" cy="100" rx="60" ry="30" fill="#0f2a18" stroke="#1a4a28" stroke-width="0.8"/>
    <ellipse cx="650" cy="380" rx="50" ry="25" fill="#0f2a18" stroke="#1a4a28" stroke-width="0.8"/>
    <ellipse cx="400" cy="230" rx="35" ry="18" fill="#0f2a18" stroke="#1a4a28" stroke-width="0.8"/>
    <ellipse cx="680" cy="100" rx="40" ry="20" fill="#0f2a18" stroke="#1a4a28" stroke-width="0.8"/>

    <!-- 小树 -->
    ${[[50,70],[90,120],[160,75],[620,90],[720,130],[700,360],[600,400],[80,370],[140,410],[350,50],[500,60],[550,400],[300,410]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#1a4a28"/><circle cx="${x}" cy="${y-2}" r="3" fill="#1d5a30"/>`).join('')}

    <!-- 园区主路 -->
    <rect x="10" y="215" width="780" height="30" fill="#1a2a35" stroke="#253545" stroke-width="0.5"/>
    <line x1="10" y1="230" x2="790" y2="230" stroke="#2a4050" stroke-width="1" stroke-dasharray="16,8"/>
    <!-- 纵向小路 -->
    <rect x="260" y="30" width="22" height="430" fill="#1a2a35" stroke="#253545" stroke-width="0.5"/>
    <rect x="520" y="30" width="22" height="430" fill="#1a2a35" stroke="#253545" stroke-width="0.5"/>

    <!-- 大门 -->
    <rect x="375" y="448" width="50" height="12" fill="#2a4a5c" rx="2"/>
    <text x="400" y="458" text-anchor="middle" fill="#5a8da0" font-size="7">🚪 主入口</text>

    <!-- ====== 楼宇 ====== -->

    <!-- A区 办公楼主楼 (左上) -->
    <g class="building${getPulse('A区')}" onclick="window.__showZoneDetail('${zd['A区']?.zone || 'A区·办公楼主楼'}')" style="cursor:pointer">
      <rect x="40" y="35" width="130" height="55" rx="4" fill="${getColor('A区')}" opacity="0.55" stroke="${getColor('A区')}" stroke-width="3" filter="url(#shadow)"/>
      <rect x="50" y="45" width="30" height="18" rx="2" fill="${getColor('A区')}" opacity="0.5"/>
      <rect x="90" y="45" width="30" height="18" rx="2" fill="${getColor('A区')}" opacity="0.5"/>
      <rect x="130" y="45" width="30" height="18" rx="2" fill="${getColor('A区')}" opacity="0.5"/>
      <rect x="50" y="68" width="110" height="4" rx="1" fill="${getColor('A区')}" opacity="0.3"/>
      <text x="105" y="108" text-anchor="middle" fill="#c8d6e5" font-size="10" font-weight="600">办公楼主楼</text>
      <text x="105" y="120" text-anchor="middle" fill="#6b7d95" font-size="8">A 区</text>
      ${zd['A区'] ? `<text x="105" y="135" text-anchor="middle" fill="${getColor('A区')}" font-size="8">🌡${zd['A区'].temp}°C  🫁${zd['A区'].pm25}</text>` : ''}
    </g>

    <!-- B区 研发中心 (中上) -->
    <g class="building${getPulse('B区')}" onclick="window.__showZoneDetail('${zd['B区']?.zone || 'B区·研发中心'}')" style="cursor:pointer">
      <rect x="300" y="30" width="120" height="65" rx="4" fill="${getColor('B区')}" opacity="0.55" stroke="${getColor('B区')}" stroke-width="3" filter="url(#shadow)"/>
      <circle cx="340" cy="55" r="14" fill="${getColor('B区')}" opacity="0.4"/>
      <rect x="365" y="46" width="45" height="8" rx="1" fill="${getColor('B区')}" opacity="0.45"/>
      <rect x="365" y="58" width="45" height="8" rx="1" fill="${getColor('B区')}" opacity="0.55"/>
      <rect x="365" y="70" width="45" height="8" rx="1" fill="${getColor('B区')}" opacity="0.3"/>
      <text x="360" y="113" text-anchor="middle" fill="#c8d6e5" font-size="10" font-weight="600">研发中心</text>
      <text x="360" y="125" text-anchor="middle" fill="#6b7d95" font-size="8">B 区</text>
      ${zd['B区'] ? `<text x="360" y="140" text-anchor="middle" fill="${getColor('B区')}" font-size="8">🌡${zd['B区'].temp}°C  🫁${zd['B区'].pm25}</text>` : ''}
    </g>

    <!-- C区 生产厂房 (右上) -->
    <g class="building${getPulse('C区')}" onclick="window.__showZoneDetail('${zd['C区']?.zone || 'C区·生产厂房'}')" style="cursor:pointer">
      <rect x="560" y="25" width="200" height="70" rx="4" fill="${getColor('C区')}" opacity="0.55" stroke="${getColor('C区')}" stroke-width="3" filter="url(#shadow)"/>
      <rect x="575" y="38" width="170" height="5" rx="1" fill="${getColor('C区')}" opacity="0.4"/>
      <rect x="575" y="48" width="170" height="5" rx="1" fill="${getColor('C区')}" opacity="0.4"/>
      <rect x="575" y="58" width="170" height="5" rx="1" fill="${getColor('C区')}" opacity="0.4"/>
      <rect x="575" y="68" width="170" height="5" rx="1" fill="${getColor('C区')}" opacity="0.55"/>
      <polygon points="620,38 625,18 630,38" fill="#ffb74d" opacity="0.6"/>
      <text x="660" y="113" text-anchor="middle" fill="#c8d6e5" font-size="10" font-weight="600">生产厂房</text>
      <text x="660" y="125" text-anchor="middle" fill="#6b7d95" font-size="8">C 区</text>
      ${zd['C区'] ? `<text x="660" y="140" text-anchor="middle" fill="${getColor('C区')}" font-size="8">🌡${zd['C区'].temp}°C  🫁${zd['C区'].pm25}</text>` : ''}
    </g>

    <!-- D区 物流仓库 (右下) -->
    <g class="building${getPulse('D区')}" onclick="window.__showZoneDetail('${zd['D区']?.zone || 'D区·物流仓库'}')" style="cursor:pointer">
      <rect x="570" y="260" width="180" height="60" rx="4" fill="${getColor('D区')}" opacity="0.55" stroke="${getColor('D区')}" stroke-width="3" filter="url(#shadow)"/>
      <rect x="585" y="275" width="150" height="30" rx="2" fill="${getColor('D区')}" opacity="0.55"/>
      <line x1="600" y1="275" x2="600" y2="305" stroke="#0d1520" stroke-width="2"/>
      <line x1="660" y1="275" x2="660" y2="305" stroke="#0d1520" stroke-width="2"/>
      <text x="660" y="340" text-anchor="middle" fill="#c8d6e5" font-size="10" font-weight="600">物流仓库</text>
      <text x="660" y="352" text-anchor="middle" fill="#6b7d95" font-size="8">D 区</text>
      ${zd['D区'] ? `<text x="660" y="367" text-anchor="middle" fill="${getColor('D区')}" font-size="8">🌡${zd['D区'].temp}°C  🫁${zd['D区'].pm25}</text>` : ''}
    </g>

    <!-- E区 地下车库 (中下) -->
    <g class="building${getPulse('E区')}" onclick="window.__showZoneDetail('${zd['E区']?.zone || 'E区·地下车库'}')" style="cursor:pointer">
      <rect x="315" y="265" width="100" height="50" rx="4" fill="${getColor('E区')}" opacity="0.55" stroke="${getColor('E区')}" stroke-width="3" filter="url(#shadow)"/>
      <rect x="328" y="278" width="74" height="24" rx="2" fill="${getColor('E区')}" opacity="0.55"/>
      <text x="365" y="296" text-anchor="middle" fill="${getColor('E区')}" font-size="7">🚗 P</text>
      <text x="365" y="335" text-anchor="middle" fill="#c8d6e5" font-size="10" font-weight="600">地下车库</text>
      <text x="365" y="347" text-anchor="middle" fill="#6b7d95" font-size="8">E 区</text>
      ${zd['E区'] ? `<text x="365" y="362" text-anchor="middle" fill="${getColor('E区')}" font-size="8">🌡${zd['E区'].temp}°C  🫁${zd['E区'].pm25}</text>` : ''}
    </g>

    <!-- F区 员工食堂 (左下) -->
    <g class="building${getPulse('F区')}" onclick="window.__showZoneDetail('${zd['F区']?.zone || 'F区·员工食堂'}')" style="cursor:pointer">
      <rect x="40" y="255" width="120" height="65" rx="4" fill="${getColor('F区')}" opacity="0.55" stroke="${getColor('F区')}" stroke-width="3" filter="url(#shadow)"/>
      <rect x="55" y="270" width="40" height="18" rx="2" fill="${getColor('F区')}" opacity="0.4"/>
      <rect x="105" y="270" width="40" height="18" rx="2" fill="${getColor('F区')}" opacity="0.55"/>
      <rect x="55" y="293" width="90" height="5" rx="1" fill="${getColor('F区')}" opacity="0.3"/>
      <text x="100" y="340" text-anchor="middle" fill="#c8d6e5" font-size="10" font-weight="600">员工食堂</text>
      <text x="100" y="352" text-anchor="middle" fill="#6b7d95" font-size="8">F 区</text>
      ${zd['F区'] ? `<text x="100" y="367" text-anchor="middle" fill="${getColor('F区')}" font-size="8">🌡${zd['F区'].temp}°C  🫁${zd['F区'].pm25}</text>` : ''}
    </g>

    <!-- 图例 -->
    <g transform="translate(12, 400)">
      <rect x="0" y="0" width="10" height="10" rx="2" fill="#4fc3f7" opacity="0.6"/>
      <text x="14" y="9" fill="#6b7d95" font-size="8">正常</text>
      <rect x="50" y="0" width="10" height="10" rx="2" fill="#ffb74d" opacity="0.6"/>
      <text x="64" y="9" fill="#6b7d95" font-size="8">预警</text>
      <rect x="100" y="0" width="10" height="10" rx="2" fill="#e57373" opacity="0.6"/>
      <text x="114" y="9" fill="#6b7d95" font-size="8">危险</text>
    </g>
  </svg>`
}

function showZoneDetail(zoneName) {
  const z = store.env.find(e => e.zone === zoneName); if (!z) return
  const ra = store.alerts.filter(a => a.location === zoneName || a.location.includes(zoneName.split('·')[1] || ''))
  const di = store.diagnosis.filter(d => d.zone === zoneName)
  const pmM = Math.max(...store.env.map(e => e.pm25), 1), coM = Math.max(...store.env.map(e => e.co2), 1)
  const h = `
    <div class="zone-overlay" onclick="this.remove()"></div>
    <div class="zone-modal"><div class="zone-modal-header"><h3>📍 ${zoneName}</h3><span class="zone-modal-status tag-${z.status==='danger'?'danger':z.status==='warn'?'warn':'success'}">${z.status==='danger'?'⚠️ 危险':z.status==='warn'?'🔶 预警':'✅ 正常'}</span><button class="zone-modal-close" onclick="this.closest('.zone-modal').remove();document.querySelector('.zone-overlay').remove()">✕</button></div>
    <div class="zone-modal-body">
      <div class="zone-gauges">
        <div class="zone-gauge"><span class="gauge-label">🌡 温度</span><div class="gauge-bar"><div class="gauge-fill gauge-temp" style="width:${(z.temp/40*100).toFixed(0)}%"></div></div><span class="gauge-val">${z.temp}°C</span></div>
        <div class="zone-gauge"><span class="gauge-label">💧 湿度</span><div class="gauge-bar"><div class="gauge-fill gauge-hum" style="width:${z.humidity}%"></div></div><span class="gauge-val">${z.humidity}%</span></div>
        <div class="zone-gauge"><span class="gauge-label">🫁 PM2.5</span><div class="gauge-bar"><div class="gauge-fill gauge-pm25" style="width:${(z.pm25/pmM*100).toFixed(0)}%"></div></div><span class="gauge-val">${z.pm25} μg/m³</span></div>
        <div class="zone-gauge"><span class="gauge-label">💨 CO₂</span><div class="gauge-bar"><div class="gauge-fill gauge-co2" style="width:${(z.co2/coM*100).toFixed(0)}%"></div></div><span class="gauge-val">${z.co2} ppm</span></div>
      </div>
      ${di.length ? `<div class="zone-section"><div class="zone-section-title">🩺 诊断</div>${di.map(d => `<div class="zone-diag-item diag-${d.severity}">${d.metric} ${d.value}${d.unit} → ${d.suggestion}</div>`).join('')}</div>` : ''}
      ${ra.length ? `<div class="zone-section"><div class="zone-section-title">🚨 告警（${ra.length}）</div>${ra.slice(0,5).map(a => `<div class="zone-alert-item"><span class="tag tag-${a.level}">${a.label}</span> ${a.time} ${a.desc}</div>`).join('')}</div>` : ''}
    </div></div>`
  document.querySelector('.zone-modal')?.remove(); document.querySelector('.zone-overlay')?.remove()
  document.body.insertAdjacentHTML('beforeend', h)
}
window.__showZoneDetail = showZoneDetail

// ==================== 声光告警 ====================

function renderMarquee() {
  const pd = store.alerts.filter(a => a.status === 'pending' && a.level === 'danger')
  if (!pd.length) return '<div class="marquee-bar marquee-ok">✅ 系统运行正常，无紧急告警</div>'
  const text = pd.map(a => `🚨 ${a.time} | ${a.device} | ${a.location} | ${a.desc}`).join('&nbsp;&nbsp;&nbsp;⏺&nbsp;&nbsp;&nbsp;')
  return `<div class="marquee-bar marquee-danger"><div class="marquee-scroll"><span>${text}</span><span>${text}</span></div></div>`
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.22, 0.44].forEach((t, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + (i < 2 ? 0.12 : 0.15)); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18) })
  } catch (_) {}
}

function showAlertToast(a) {
  const t = document.createElement('div'); t.className = `alert-toast toast-${a.level}`
  t.innerHTML = `<div class="toast-icon">${a.level === 'danger' ? '🔴' : '🟡'}</div><div class="toast-body"><div class="toast-title">${a.label}告警</div><div class="toast-text">${a.device} — ${a.desc}</div></div><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`
  document.body.appendChild(t); setTimeout(() => t.parentElement && t.remove(), 6000)
}

function checkAlertBursts() {
  const nd = store.alerts.filter(a => a.status === 'pending' && a.level === 'danger' && !alertedIds.has(a.id))
  if (nd.length) { playAlertSound(); nd.forEach(a => { alertedIds.add(a.id); showAlertToast(a) }); if (alertedIds.size > 100) [...alertedIds].slice(0, alertedIds.size - 80).forEach(id => alertedIds.delete(id)) }
  const ka = document.querySelector('.kpi-card:nth-child(3)')
  if (ka) ka.classList.toggle('kpi-pulse', store.alerts.filter(a => a.status === 'pending' && a.level === 'danger').length > 0)
}



// ==================== AI 面板 ====================

function renderAIPanel() {
  return `<div class="ai-panel" id="aiPanel">
    <div class="ai-panel-header"><span class="ai-panel-title">🤖 AI 智能分析</span><button class="ai-panel-toggle" id="aiPanelToggle" title="折叠">◀</button></div>
    <div class="ai-panel-body" id="aiPanelBody"><div class="ai-summary" id="aiSummary">${generateSummary().replace(/\n/g, '<br>')}</div><div class="ai-chat" id="aiChat"></div></div>
    <div class="ai-panel-input"><input type="text" id="aiInput" placeholder="提问：哪个区域最危险？" /><button id="aiSend">发送</button></div>
  </div>`
}

function initAIPanel() {
  const send = () => { const t = $('#aiInput').value.trim(); if (!t) return; const a = aiQuery(t); const c = $('#aiChat'); c.innerHTML += `<div class="ai-msg ai-msg-user">🧑 ${t}</div><div class="ai-msg ai-msg-bot">${a.replace(/\n/g, '<br>')}</div>`; c.scrollTop = c.scrollHeight; $('#aiInput').value = '' }
  $('#aiSend').addEventListener('click', send)
  $('#aiInput').addEventListener('keydown', e => { if (e.key === 'Enter') send() })
  $('#aiPanelToggle').addEventListener('click', () => { const p = $('#aiPanel'), b = $('#aiPanelToggle'); p.classList.toggle('ai-collapsed'); b.textContent = p.classList.contains('ai-collapsed') ? '▶' : '◀'; setTimeout(() => Object.values(chartInstances).forEach(c => c?.resize()), 350) })
}

// ==================== 大屏渲染 ====================

function renderDashboard() {
  return `<div class="dashboard-screen">
    <div id="marqueeRow">${renderMarquee()}</div>
    <div class="kpi-row" id="kpiRow">${renderKpiCards()}</div>
    <div class="dashboard-main">
      <div class="dashboard-left">
        <div class="chart-row"><div class="chart-box"><div class="chart-header"><span class="chart-title">📈 24h 多维趋势监控</span><span class="chart-subtitle">能耗 · 温度 · 湿度 | 实时刷新</span></div><div class="chart-body" id="chartLine"></div></div><div class="chart-box"><div class="chart-header"><span class="chart-title">🍩 设备类型占比分布</span><span class="chart-subtitle">按设备类别统计</span></div><div class="chart-body" id="chartPie"></div></div></div>
        <div class="chart-row map-heat-row"><div class="chart-box"><div class="chart-header"><span class="chart-title">🏗️ 园区楼宇分布</span><span class="chart-subtitle">点击楼宇查看详情</span></div><div class="chart-body" id="zoneMapContainer">${renderMapPanel()}</div></div><div class="chart-box"><div class="chart-header"><span class="chart-title">🔥 环境空间密度热力图</span><span class="chart-subtitle">各区域 PM2.5 · CO₂ · 温度 · 湿度</span></div><div class="chart-body chart-body-heatmap" id="chartHeatmap"></div></div></div>
        <div class="chart-row"><div class="chart-box chart-box-full"><div class="chart-header"><span class="chart-title">🩺 智能故障诊断</span><span class="chart-subtitle">基于实时传感器的异常检测与诊断建议</span>${store.diagnosis.length ? `<span class="diag-count diag-count-badge">${store.diagnosis.length} 项异常</span>` : '<span class="diag-count diag-count-ok">全部正常</span>'}</div><div class="chart-body" id="diagnosisPanel">${renderDiagnosisPanel()}</div></div></div>
      </div>
      <div class="dashboard-right" id="aiPanelContainer">${renderAIPanel()}</div>
    </div>
  </div>`
}

function initDashboard() {
  disposeAllCharts()
  requestAnimationFrame(() => {
    renderLineChart('chartLine', store.energyTrend)
    renderPieChart('chartPie', store.deviceTypeStats)
    renderHeatmap('chartHeatmap', store.env)
    initAIPanel()
  })
}

function refreshDashboard() {
  renderLineChart('chartLine', store.energyTrend)
  renderPieChart('chartPie', store.deviceTypeStats)
  renderHeatmap('chartHeatmap', store.env)
  const kpi = $('#kpiRow'); if (kpi) kpi.innerHTML = renderKpiCards()
  const diag = $('#diagnosisPanel'); if (diag) diag.innerHTML = renderDiagnosisPanel()
  const marq = $('#marqueeRow'); if (marq) marq.innerHTML = renderMarquee()
  const map = $('#zoneMapContainer'); if (map) map.innerHTML = renderMapPanel()
  const sum = $('#aiSummary'); if (sum) sum.innerHTML = generateSummary().replace(/\n/g, '<br>')
  checkAlertBursts()
}

// ==================== 启动 ====================

window.addEventListener('resize', () => Object.values(chartInstances).forEach(c => c?.resize()))
connectWebSocket()
$('#dashboard').innerHTML = renderDashboard()
initDashboard()
