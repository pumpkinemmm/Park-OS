/* ================================================
   智慧园区演示系统 — Park OS
   多维监控大屏 + WebSocket 实时推送 + 智能故障诊断
   ================================================ */

// --- 工具 ---
const $ = (s) => document.querySelector(s)
const $$ = (s) => document.querySelectorAll(s)
const fmt = (n) => n.toLocaleString('zh-CN')
const pct = (a, b) => ((a / b) * 100).toFixed(1) + '%'

// ==================== 全局数据存储 ====================

const store = {
  connected: false,
  stats: {
    devices: 1286, online: 1267, offline: 19,
    alertsToday: 23, alertsResolved: 18,
    energyToday: 4820, energyYesterday: 4979,
    visitorsToday: 1847, visitorsYesterday: 2103,
    parkingTotal: 860, parkingUsed: 623,
  },
  energyTrend: [
    { time: '00:00', energy: 180, temp: 22.5, humidity: 55 },
    { time: '02:00', energy: 150, temp: 22.0, humidity: 58 },
    { time: '04:00', energy: 140, temp: 21.5, humidity: 60 },
    { time: '06:00', energy: 220, temp: 22.8, humidity: 57 },
    { time: '08:00', energy: 380, temp: 24.0, humidity: 52 },
    { time: '10:00', energy: 410, temp: 24.8, humidity: 50 },
    { time: '12:00', energy: 390, temp: 25.2, humidity: 48 },
    { time: '14:00', energy: 420, temp: 25.5, humidity: 47 },
    { time: '16:00', energy: 400, temp: 25.0, humidity: 49 },
    { time: '18:00', energy: 350, temp: 24.2, humidity: 51 },
    { time: '20:00', energy: 280, temp: 23.5, humidity: 53 },
    { time: '22:00', energy: 210, temp: 22.8, humidity: 54 },
  ],
  env: [
    { zone: 'A区·办公楼主楼', temp: 24.5, humidity: 52, pm25: 18, co2: 480, status: 'good' },
    { zone: 'B区·研发中心', temp: 23.8, humidity: 48, pm25: 15, co2: 420, status: 'good' },
    { zone: 'C区·生产厂房', temp: 28.2, humidity: 62, pm25: 45, co2: 680, status: 'warn' },
    { zone: 'D区·物流仓库', temp: 26.0, humidity: 55, pm25: 32, co2: 520, status: 'good' },
    { zone: 'E区·地下车库', temp: 22.1, humidity: 70, pm25: 28, co2: 850, status: 'warn' },
    { zone: 'F区·员工食堂', temp: 25.6, humidity: 58, pm25: 22, co2: 550, status: 'good' },
  ],
  deviceTypeStats: [
    { name: '视频监控', total: 320, online: 316 },
    { name: '环境传感器', total: 186, online: 185 },
    { name: '门禁设备', total: 48, online: 46 },
    { name: '消防设备', total: 156, online: 152 },
    { name: '照明系统', total: 576, online: 568 },
  ],
  alerts: [
    { id: 1, time: '10:32:15', device: '烟感传感器 #A12', location: 'C区·3号厂房', level: 'danger', label: '紧急', status: 'pending', desc: '烟雾浓度超标 3.2 倍' },
    { id: 2, time: '10:28:03', device: '水位监测 #B07', location: 'E区·地下车库B2', level: 'warn', label: '警告', status: 'pending', desc: '水位超过警戒线 15cm' },
    { id: 3, time: '10:15:44', device: '门禁控制器 #D03', location: 'A区·西大门', level: 'info', label: '提示', status: 'resolved', desc: '非法卡刷卡 3 次后锁定' },
    { id: 4, time: '09:58:21', device: '变压器 #T01', location: 'C区·配电房', level: 'warn', label: '警告', status: 'processing', desc: '三相电流不平衡 18%' },
    { id: 5, time: '09:42:10', device: '消防泵 #P05', location: 'C区·消防站', level: 'danger', label: '紧急', status: 'processing', desc: '泵体压力异常下降' },
    { id: 6, time: '09:20:33', device: '温湿度传感器 #H12', location: 'B区·数据中心', level: 'warn', label: '警告', status: 'resolved', desc: '温度超过 28°C 阈值' },
    { id: 7, time: '08:55:07', device: '电梯监控 #E03', location: 'A区·办公楼主楼', level: 'info', label: '提示', status: 'resolved', desc: '3号梯停靠超时 60s' },
    { id: 8, time: '08:30:52', device: '光伏逆变器 #S01', location: 'C区·屋顶光伏站', level: 'info', label: '提示', status: 'resolved', desc: '发电功率骤降 40%，疑似云层遮挡' },
  ],
  diagnosis: [],
  // 静态数据（非大屏页使用）
  devices: [
    { id: 'CAM-001', name: '高清球机 #A01', type: '视频监控', location: 'A区·主入口', status: 'online', ip: '192.168.1.101', updated: '10:30:15' },
    { id: 'CAM-002', name: '高清球机 #A02', type: '视频监控', location: 'A区·办公楼大堂', status: 'online', ip: '192.168.1.102', updated: '10:30:18' },
    { id: 'SEN-001', name: '烟感传感器 #A12', type: '消防设备', location: 'C区·3号厂房', status: 'alarm', ip: '192.168.2.201', updated: '10:32:15' },
    { id: 'SEN-002', name: '温湿度传感器 #H12', type: '环境传感器', location: 'B区·数据中心', status: 'online', ip: '192.168.2.202', updated: '10:28:00' },
    { id: 'SEN-003', name: '水位监测 #B07', type: '环境传感器', location: 'E区·地下车库B2', status: 'alarm', ip: '192.168.2.203', updated: '10:28:03' },
    { id: 'CTL-001', name: '门禁控制器 #D03', type: '门禁设备', location: 'A区·西大门', status: 'online', ip: '192.168.3.101', updated: '10:30:05' },
    { id: 'CTL-002', name: '门禁控制器 #D05', type: '门禁设备', location: 'B区·东门', status: 'offline', ip: '192.168.3.102', updated: '09:15:33' },
    { id: 'PWR-001', name: '变压器 #T01', type: '电力设备', location: 'C区·配电房', status: 'alarm', ip: '192.168.4.101', updated: '09:58:21' },
    { id: 'PWR-002', name: '光伏逆变器 #S01', type: '电力设备', location: 'C区·屋顶光伏站', status: 'online', ip: '192.168.4.102', updated: '10:29:55' },
    { id: 'FIRE-001', name: '消防泵 #P05', type: '消防设备', location: 'C区·消防站', status: 'alarm', ip: '192.168.5.101', updated: '09:42:10' },
    { id: 'LIT-001', name: '智能路灯 #L22', type: '照明系统', location: '园区主干道·东段', status: 'online', ip: '192.168.6.201', updated: '10:31:02' },
    { id: 'LIT-002', name: '智能路灯 #L45', type: '照明系统', location: '园区主干道·西段', status: 'offline', ip: '192.168.6.202', updated: '06:45:11' },
  ],
  parkingLots: [
    { name: 'A区·地面停车场', total: 200, used: 156 },
    { name: 'B区·地下车库B1', total: 300, used: 227 },
    { name: 'B区·地下车库B2', total: 200, used: 143 },
    { name: 'C区·货运停车场', total: 100, used: 62 },
    { name: 'D区·访客停车场', total: 60, used: 35 },
  ],
  cameras: [
    { id: 'CAM-01', name: '主入口', location: 'A区·大门' },
    { id: 'CAM-02', name: '办公楼大堂', location: 'A区·1F' },
    { id: 'CAM-03', name: '研发中心走廊', location: 'B区·3F' },
    { id: 'CAM-04', name: '生产厂房入口', location: 'C区·东门' },
    { id: 'CAM-05', name: '地下车库B1', location: 'E区·B1' },
    { id: 'CAM-06', name: '园区主干道', location: '主干道·中段' },
    { id: 'CAM-07', name: '员工食堂', location: 'F区·1F' },
    { id: 'CAM-08', name: '物流仓库', location: 'D区·装卸区' },
  ],
}

// ==================== WebSocket 客户端 ====================

let ws = null
let wsReconnectTimer = null

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  try {
    ws = new WebSocket('ws://localhost:3001')
  } catch (e) {
    console.warn('WebSocket 连接创建失败:', e.message)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    console.log('🔗 WebSocket 已连接')
    store.connected = true
    updateConnectionIndicator()
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  }

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      if (payload.type === 'iot_data') {
        // 更新全局 store
        if (payload.stats) store.stats = payload.stats
        if (payload.energyTrend) store.energyTrend = payload.energyTrend
        if (payload.env) store.env = payload.env
        if (payload.deviceTypeStats) store.deviceTypeStats = payload.deviceTypeStats
        if (payload.alerts) store.alerts = payload.alerts
        if (payload.diagnosis) store.diagnosis = payload.diagnosis

        // 刷新大屏（如果当前在 dashboard 页面）
        if (activeTab === 'dashboard' && tabs.dashboard) {
          refreshDashboardCharts()
        }
        updateAlertBadge()
      }
    } catch (e) {
      console.error('WebSocket 消息解析失败:', e.message)
    }
  }

  ws.onclose = () => {
    console.log('🔌 WebSocket 已断开')
    store.connected = false
    updateConnectionIndicator()
    scheduleReconnect()
  }

  ws.onerror = (err) => {
    console.error('⚠️ WebSocket 错误:', err)
  }
}

function scheduleReconnect() {
  if (wsReconnectTimer) return
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null
    console.log('🔄 尝试重连 WebSocket...')
    connectWebSocket()
  }, 5000)
}

function updateConnectionIndicator() {
  const el = $('#wsIndicator')
  if (!el) return
  if (store.connected) {
    el.className = 'ws-indicator ws-connected'
    el.title = 'WebSocket 已连接 · 实时数据推送中'
  } else {
    el.className = 'ws-indicator ws-disconnected'
    el.title = 'WebSocket 已断开 · 正在尝试重连'
  }
}

// ==================== ECharts 图表管理 ====================

const chartInstances = {}

function getOrCreateChart(domId) {
  if (chartInstances[domId]) return chartInstances[domId]
  const dom = document.getElementById(domId)
  if (!dom) return null
  const chart = echarts.init(dom)
  chartInstances[domId] = chart
  return chart
}

function disposeChart(domId) {
  if (chartInstances[domId]) {
    chartInstances[domId].dispose()
    delete chartInstances[domId]
  }
}

function disposeAllCharts() {
  for (const key of Object.keys(chartInstances)) {
    disposeChart(key)
  }
}

/** 折线图：24h 能耗 + 温度 + 湿度 双 Y 轴趋势 */
function renderLineChart(domId, data) {
  const chart = getOrCreateChart(domId)
  if (!chart) return

  const times = data.map(d => d.time)
  const energy = data.map(d => d.energy)
  const temp = data.map(d => d.temp)
  const humidity = data.map(d => d.humidity)

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,20,35,0.92)',
      borderColor: '#1e3a5f',
      textStyle: { color: '#c8d6e5', fontSize: 12 },
    },
    legend: {
      data: ['能耗 (kWh)', '温度 (°C)', '湿度 (%)'],
      bottom: 0,
      textStyle: { color: '#8899aa', fontSize: 11 },
      itemGap: 20,
    },
    grid: { left: 50, right: 55, top: 18, bottom: 38 },
    xAxis: {
      type: 'category',
      data: times,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#2a3a5c' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b7d95', fontSize: 10, rotate: times.length > 16 ? 45 : 0 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: '#6b7d95', fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#1a2a40', type: 'dashed' } },
        axisLabel: { color: '#6b7d95', fontSize: 10 },
      },
      {
        type: 'value',
        name: '°C / %',
        nameTextStyle: { color: '#6b7d95', fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#6b7d95', fontSize: 10 },
      },
    ],
    series: [
      {
        name: '能耗 (kWh)',
        type: 'line',
        data: energy,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.5, color: '#4fc3f7' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(79,195,247,0.25)' },
            { offset: 1, color: 'rgba(79,195,247,0.02)' },
          ]),
        },
      },
      {
        name: '温度 (°C)',
        type: 'line',
        yAxisIndex: 1,
        data: temp,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#ff8a65' },
      },
      {
        name: '湿度 (%)',
        type: 'line',
        yAxisIndex: 1,
        data: humidity,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#81c784' },
      },
    ],
  }, true) // notMerge=true 确保数据完全替换
}

/** 饼图：设备类型占比 */
function renderPieChart(domId, data) {
  const chart = getOrCreateChart(domId)
  if (!chart) return

  const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8']

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,20,35,0.92)',
      borderColor: '#1e3a5f',
      textStyle: { color: '#c8d6e5', fontSize: 12 },
      formatter: '{b}: {c} 台 ({d}%)',
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: '#8899aa', fontSize: 11 },
      itemGap: 12,
    },
    series: [{
      type: 'pie',
      radius: ['52%', '78%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 3, borderColor: '#0f1629', borderWidth: 3 },
      label: {
        show: true,
        position: 'inside',
        formatter: '{d}%',
        fontSize: 11,
        color: '#fff',
      },
      emphasis: {
        label: { fontSize: 16, fontWeight: 'bold' },
        scaleSize: 8,
      },
      data: data.map((d, i) => ({
        value: d.total,
        name: d.name,
        itemStyle: { color: colors[i % colors.length] },
      })),
    }],
  }, true)
}

/** 热力图：园区各区域 × 环境指标空间密度 */
function renderHeatmap(domId, envData) {
  const chart = getOrCreateChart(domId)
  if (!chart) return

  const metrics = ['PM2.5', 'CO₂', '温度', '湿度']
  const zones = envData.map(e => e.zone.split('·')[1] || e.zone)

  // 构建热力数据：[zoneIdx, metricIdx, value]
  const heatData = []
  envData.forEach((e, zi) => {
    heatData.push([zi, 0, e.pm25])
    heatData.push([zi, 1, e.co2])
    heatData.push([zi, 2, e.temp])
    heatData.push([zi, 3, e.humidity])
  })

  // 各指标的最大值用于归一化
  const maxPM25 = Math.max(...envData.map(e => e.pm25), 1)
  const maxCO2 = Math.max(...envData.map(e => e.co2), 1)
  const maxTemp = Math.max(...envData.map(e => e.temp), 1)
  const maxHumidity = Math.max(...envData.map(e => e.humidity), 1)

  // 归一化到 0-100
  const normalized = heatData.map(([zi, mi, val]) => {
    const maxes = [maxPM25, maxCO2, maxTemp, maxHumidity]
    return [zi, mi, Math.round(val / maxes[mi] * 100)]
  })

  chart.setOption({
    tooltip: {
      backgroundColor: 'rgba(15,20,35,0.92)',
      borderColor: '#1e3a5f',
      textStyle: { color: '#c8d6e5', fontSize: 12 },
      formatter: (p) => {
        const raw = heatData.find(d => d[0] === p.data[0] && d[1] === p.data[1])
        const units = ['μg/m³', 'ppm', '°C', '%']
        return `${zones[p.data[0]]}<br/>${metrics[p.data[1]]}: <b>${raw ? raw[2] : '--'} ${units[p.data[1]]}</b>`
      },
    },
    grid: { left: 90, right: 40, top: 10, bottom: 30 },
    xAxis: {
      type: 'category',
      data: zones,
      position: 'bottom',
      axisLine: { lineStyle: { color: '#2a3a5c' } },
      axisTick: { show: false },
      axisLabel: { color: '#8899aa', fontSize: 10, rotate: 20 },
    },
    yAxis: {
      type: 'category',
      data: metrics,
      axisLine: { lineStyle: { color: '#2a3a5c' } },
      axisTick: { show: false },
      axisLabel: { color: '#8899aa', fontSize: 10 },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: 'vertical',
      right: 0,
      top: 'center',
      textStyle: { color: '#6b7d95', fontSize: 10 },
      inRange: {
        color: ['#0a1628', '#0d3b66', '#1a6b9e', '#28aae1', '#4fc3f7', '#81d4fa'],
      },
    },
    series: [{
      type: 'heatmap',
      data: normalized,
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(79,195,247,0.6)' },
      },
    }],
  }, true)
}

/** 刷新大屏图表（WebSocket 数据更新时调用） */
function refreshDashboardCharts() {
  renderLineChart('chartLine', store.energyTrend)
  renderPieChart('chartPie', store.deviceTypeStats)
  renderHeatmap('chartHeatmap', store.env)

  // 刷新 KPI 卡片
  const kpiEl = $('#kpiRow')
  if (kpiEl) kpiEl.innerHTML = renderKpiCards()

  // 刷新诊断面板
  const diagEl = $('#diagnosisPanel')
  if (diagEl) diagEl.innerHTML = renderDiagnosisPanel()
}

// ==================== 大屏渲染组件 ====================

function renderKpiCards() {
  const s = store.stats
  const onlineRate = pct(s.online, s.devices)
  const alertRemain = s.alertsToday - s.alertsResolved
  const visitorChange = s.visitorsYesterday > 0
    ? ((s.visitorsToday - s.visitorsYesterday) / s.visitorsYesterday * 100).toFixed(1)
    : '0'
  const visitorTrend = +visitorChange >= 0 ? '▲' : '▼'
  const visitorCls = +visitorChange >= 0 ? 'trend-up' : 'trend-down'

  return `
    <div class="kpi-card">
      <div class="kpi-icon" style="background:rgba(79,195,247,.15);color:#4fc3f7">📡</div>
      <div class="kpi-body">
        <div class="kpi-label">设备总数 / 在线率</div>
        <div class="kpi-value">${fmt(s.devices)} <span class="kpi-rate">${onlineRate}</span></div>
        <div class="kpi-sub"><span class="dot online"></span>在线 ${fmt(s.online)} &nbsp;<span class="dot offline"></span>离线 ${s.offline}</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:rgba(129,199,132,.15);color:#81c784">👥</div>
      <div class="kpi-body">
        <div class="kpi-label">今日访客</div>
        <div class="kpi-value">${fmt(s.visitorsToday)} <span class="kpi-unit">人次</span></div>
        <div class="kpi-sub"><span class="${visitorCls}">${visitorTrend} ${Math.abs(+visitorChange)}%</span> 较昨日</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:rgba(229,115,115,.15);color:#e57373">🚨</div>
      <div class="kpi-body">
        <div class="kpi-label">今日告警</div>
        <div class="kpi-value kpi-danger">${s.alertsToday}</div>
        <div class="kpi-sub">已处理 <span class="trend-up">${s.alertsResolved}</span> · 剩余 <span class="trend-down">${alertRemain}</span></div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:rgba(255,183,77,.15);color:#ffb74d">⚡</div>
      <div class="kpi-body">
        <div class="kpi-label">今日能耗</div>
        <div class="kpi-value">${fmt(s.energyToday)} <span class="kpi-unit">kWh</span></div>
        <div class="kpi-sub">昨日 ${fmt(s.energyYesterday)} kWh</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon" style="background:rgba(186,104,200,.15);color:#ba68c8">🅿️</div>
      <div class="kpi-body">
        <div class="kpi-label">车位占用率</div>
        <div class="kpi-value">${pct(s.parkingUsed, s.parkingTotal)}</div>
        <div class="kpi-sub">${fmt(s.parkingUsed)} / ${fmt(s.parkingTotal)} 个</div>
      </div>
    </div>
  `
}

function renderDiagnosisPanel() {
  if (!store.diagnosis || store.diagnosis.length === 0) {
    return `<div class="diagnosis-empty">✅ 当前所有区域运行正常，未检测到异常指标</div>`
  }

  const cards = store.diagnosis.map(d => {
    const sevMap = { danger: '紧急', warn: '警告' }
    const sevLabel = sevMap[d.severity] || d.severity
    return `
      <div class="diagnosis-card diag-${d.severity}">
        <div class="diag-header">
          <span class="diag-zone">📍 ${d.zone}</span>
          <span class="diag-tag diag-tag-${d.severity}">${sevLabel}</span>
        </div>
        <div class="diag-body">
          <div class="diag-metric">
            <span class="diag-name">${d.metric}</span>
            <span class="diag-value">${d.value} ${d.unit}</span>
            <span class="diag-threshold">阈值: ${d.threshold}</span>
          </div>
          <div class="diag-cause">
            <span class="diag-cause-label">🔍 诊断:</span> ${d.cause}
          </div>
          <div class="diag-suggestion">
            <span class="diag-sug-label">💡 建议:</span> ${d.suggestion}
          </div>
        </div>
      </div>
    `
  }).join('')

  return `<div class="diagnosis-list">${cards}</div>`
}

// ==================== 大屏仪表盘渲染 ====================

function renderDashboard() {
  return `
    <div class="dashboard-screen">
      <!-- KPI 指标行 -->
      <div class="kpi-row" id="kpiRow">${renderKpiCards()}</div>

      <!-- 图表区：折线图 + 饼图 -->
      <div class="chart-row">
        <div class="chart-box chart-box-large">
          <div class="chart-header">
            <span class="chart-title">📈 24h 多维趋势监控</span>
            <span class="chart-subtitle">能耗 · 温度 · 湿度 | 实时刷新</span>
          </div>
          <div class="chart-body" id="chartLine"></div>
        </div>
        <div class="chart-box chart-box-small">
          <div class="chart-header">
            <span class="chart-title">🍩 设备类型占比分布</span>
            <span class="chart-subtitle">按设备类别统计</span>
          </div>
          <div class="chart-body" id="chartPie"></div>
        </div>
      </div>

      <!-- 热力图 -->
      <div class="chart-row">
        <div class="chart-box chart-box-full">
          <div class="chart-header">
            <span class="chart-title">🔥 园区环境空间密度热力图</span>
            <span class="chart-subtitle">各区域 PM2.5 · CO₂ · 温度 · 湿度 归一化分布</span>
          </div>
          <div class="chart-body chart-body-heatmap" id="chartHeatmap"></div>
        </div>
      </div>

      <!-- 智能故障诊断 -->
      <div class="chart-row">
        <div class="chart-box chart-box-full">
          <div class="chart-header">
            <span class="chart-title">🩺 智能故障诊断</span>
            <span class="chart-subtitle">基于实时传感器数据的异常检测与诊断建议</span>
            ${store.diagnosis.length > 0 ? `<span class="diag-count diag-count-badge">${store.diagnosis.length} 项异常</span>` : '<span class="diag-count diag-count-ok">全部正常</span>'}
          </div>
          <div class="chart-body" id="diagnosisPanel">${renderDiagnosisPanel()}</div>
        </div>
      </div>
    </div>
  `
}

/** 大屏初始化：渲染 HTML 后创建 ECharts 实例 */
function initDashboardCharts() {
  // 先销毁旧实例
  disposeAllCharts()

  // 等待 DOM 就绪后初始化图表
  requestAnimationFrame(() => {
    renderLineChart('chartLine', store.energyTrend)
    renderPieChart('chartPie', store.deviceTypeStats)
    renderHeatmap('chartHeatmap', store.env)
  })
}

// ==================== 非大屏页面渲染（保持原有功能） ====================

function renderDevices() {
  const rows = store.devices.map(d => {
    const st = d.status === 'online' ? 'tag-success' : d.status === 'alarm' ? 'tag-danger' : 'tag-warn'
    const stLabel = d.status === 'online' ? '在线' : d.status === 'alarm' ? '告警' : '离线'
    return `<tr>
      <td>${d.id}</td><td>${d.name}</td><td>${d.type}</td><td>${d.location}</td>
      <td><span class="tag ${st}">${stLabel}</span></td>
      <td>${d.ip}</td><td>${d.updated}</td>
    </tr>`
  }).join('')
  return `<div class="panel" style="margin-bottom:0">
    <div class="panel-header">设备清单 <span class="header-tag">${store.devices.length} 台</span></div>
    <div class="panel-body" style="padding:0">
      <table><thead><tr><th>编号</th><th>名称</th><th>类型</th><th>位置</th><th>状态</th><th>IP</th><th>更新时间</th></tr></thead><tbody>${rows}</tbody></table>
    </div></div>`
}

function renderSecurity() {
  const grid = store.cameras.map(c => `
    <div class="cam-card">
      <div class="cam-preview">📹</div>
      <div class="cam-info">
        <div class="cam-name">${c.name}</div>
        <div class="cam-loc">${c.location}</div>
        <span class="cam-status">● 在线</span>
      </div>
    </div>
  `).join('')
  return `<div class="cam-grid">${grid}</div>`
}

function renderEnergy() {
  // 能耗页面复用折线图（独立实例）
  return `
    <div class="stat-row">
      <div class="stat-card"><div class="label">今日用电</div><div class="value">${fmt(store.stats.energyToday)}<span class="unit">kWh</span></div><div class="sub">实时监测中</div></div>
      <div class="stat-card"><div class="label">昨日用电</div><div class="value">${fmt(store.stats.energyYesterday)}<span class="unit">kWh</span></div></div>
      <div class="stat-card"><div class="label">本月累计</div><div class="value">${fmt(142500)}<span class="unit">kWh</span></div></div>
      <div class="stat-card"><div class="label">光伏发电</div><div class="value">${fmt(2180)}<span class="unit">kWh</span></div></div>
    </div>
    <div class="panel">
      <div class="panel-header">24h 能耗趋势</div>
      <div class="panel-body"><div class="chart-body" id="chartEnergyPage" style="height:280px"></div></div>
    </div>
  `
}

function renderParking() {
  const lots = store.parkingLots.map(l => {
    const rate = (l.used / l.total * 100).toFixed(0)
    const cls = rate > 85 ? 'danger' : rate > 70 ? 'warn' : 'success'
    return `
      <div class="panel">
        <div class="panel-header">${l.name}</div>
        <div class="panel-body">
          <div class="parking-row">
            <div class="parking-nums">
              <span class="parking-used">${l.used}</span><span class="parking-sep">/</span><span class="parking-total">${l.total}</span>
              <span class="tag tag-${cls}" style="margin-left:10px">${rate}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill progress-${cls}" style="width:${rate}%"></div></div>
            <div class="parking-free">剩余 ${l.total - l.used} 个车位</div>
          </div>
        </div>
      </div>`
  }).join('')
  return `<div style="max-width:640px">${lots}</div>`
}

function renderAlerts() {
  const rows = store.alerts.map(a => {
    const stCls = a.status === 'pending' ? 'tag-danger' : a.status === 'processing' ? 'tag-warn' : 'tag-success'
    const stLabel = a.status === 'pending' ? '待处理' : a.status === 'processing' ? '处理中' : '已解决'
    return `<tr>
      <td>${a.time}</td><td>${a.device}</td><td>${a.location}</td>
      <td><span class="tag tag-${a.level}">${a.label}</span></td><td>${a.desc}</td>
      <td><span class="tag ${stCls}">${stLabel}</span></td>
    </tr>`
  }).join('')
  return `<div class="panel" style="margin-bottom:0">
    <div class="panel-header">告警列表 <span class="header-tag">${store.alerts.length} 条</span></div>
    <div class="panel-body" style="padding:0">
      <table><thead><tr><th>时间</th><th>设备</th><th>位置</th><th>级别</th><th>描述</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table>
    </div></div>`
}

// ==================== 页面定义 ====================

const pageDefs = {
  dashboard: { title: '📊 监控大屏', render: renderDashboard, onShow: initDashboardCharts, onHide: disposeAllCharts },
  devices:    { title: '🔌 设备管理', render: renderDevices },
  security:   { title: '🛡️ 安防监控', render: renderSecurity },
  energy:     { title: '⚡ 能耗管理', render: renderEnergy, onShow() { requestAnimationFrame(() => renderLineChart('chartEnergyPage', store.energyTrend)) }, onHide() { disposeChart('chartEnergyPage') } },
  parking:    { title: '🅿️ 停车管理', render: renderParking },
  alerts:     { title: '🚨 告警中心', render: renderAlerts },
}

// ==================== Tab 管理 ====================

const tabBar = $('#tabBar')
const tabContent = $('#tabContent')
const tabs = {}
let activeTab = null

function createTab(page) {
  const def = pageDefs[page]
  if (!def) return
  if (tabs[page]) return switchTab(page)

  const panel = document.createElement('div')
  panel.className = 'tab-panel'
  panel.innerHTML = def.render()
  tabContent.appendChild(panel)

  const closable = page !== 'dashboard'
  const tabEl = document.createElement('span')
  tabEl.className = 'tab-item'
  tabEl.innerHTML = `${def.title}${closable ? '<span class="tab-close">✕</span>' : ''}`
  tabEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-close')) return
    switchTab(page)
  })
  if (closable) {
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation()
      closeTab(page)
    })
  }
  tabBar.appendChild(tabEl)
  tabs[page] = { el: panel, tabEl, closable, def }
  switchTab(page)
}

function switchTab(page) {
  if (activeTab === page) return

  // 隐藏旧页面
  if (activeTab && tabs[activeTab]) {
    tabs[activeTab].el.classList.remove('active')
    tabs[activeTab].tabEl.classList.remove('active')
    if (tabs[activeTab].def.onHide) tabs[activeTab].def.onHide()
  }

  activeTab = page
  tabs[page].el.classList.add('active')
  tabs[page].tabEl.classList.add('active')
  if (tabs[page].def.onShow) tabs[page].def.onShow()

  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page))
  document.title = pageDefs[page].title + ' - Park OS'
  window.location.hash = page
  updateAlertBadge()
}

function closeTab(page) {
  if (!tabs[page] || !tabs[page].closable) return
  if (activeTab === page) {
    if (tabs[page].def.onHide) tabs[page].def.onHide()
    const keys = Object.keys(tabs)
    const i = keys.indexOf(page)
    const next = keys[i + 1] || keys[i - 1]
    if (next) switchTab(next)
  }
  tabs[page].el.remove()
  tabs[page].tabEl.remove()
  delete tabs[page]
}

// ==================== 告警角标 ====================

function updateAlertBadge() {
  const pending = store.alerts.filter(a => a.status === 'pending').length
  const navAlert = $('[data-page="alerts"]')
  if (pending > 0) {
    navAlert.style.position = 'relative'
    if (!navAlert.querySelector('.badge')) {
      const b = document.createElement('span')
      b.className = 'badge'
      navAlert.appendChild(b)
    }
    navAlert.querySelector('.badge').textContent = pending
  } else {
    const b = navAlert.querySelector('.badge')
    if (b) b.remove()
  }
}

// ==================== 侧边栏 ====================

$$('.nav-item').forEach(el => el.addEventListener('click', (e) => {
  e.preventDefault()
  createTab(el.dataset.page)
  closeSidebar()
}))

function openSidebar() {
  $('#sidebar').classList.add('open')
  $('#sidebarOverlay').classList.add('show')
}
function closeSidebar() {
  $('#sidebar').classList.remove('open')
  $('#sidebarOverlay').classList.remove('show')
}

$('#sidebarToggle').addEventListener('click', () => {
  $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar()
})
$('#sidebarOverlay').addEventListener('click', closeSidebar)

// ==================== 时钟 ====================

function tick() {
  $('#headerTime').textContent = new Date().toLocaleString('zh-CN', { hour12: false })
}
tick()
setInterval(tick, 1000)

// ==================== 窗口 resize → ECharts 自适应 ====================

window.addEventListener('resize', () => {
  for (const key of Object.keys(chartInstances)) {
    chartInstances[key]?.resize()
  }
})

// ==================== 启动 ====================

// 1. 连接 WebSocket
connectWebSocket()

// 2. 初始页面
updateAlertBadge()
const hash = window.location.hash.slice(1) || 'dashboard'
createTab(hash)

window.addEventListener('hashchange', () => {
  const page = window.location.hash.slice(1) || 'dashboard'
  createTab(page)
})
