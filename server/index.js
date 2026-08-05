/* ================================================
   Park OS — WebSocket IoT 数据推送服务
   端口 3001，每秒推送一次模拟传感器数据
   ================================================ */

const { WebSocketServer } = require('ws')

const PORT = 3001
const wss = new WebSocketServer({ port: PORT })

console.log(`🚀 Park OS WebSocket 服务已启动 → ws://localhost:${PORT}`)

// ==================== 数据生成 ====================

const ZONES = [
  'A区·办公楼主楼', 'B区·研发中心', 'C区·生产厂房',
  'D区·物流仓库', 'E区·地下车库', 'F区·员工食堂',
]

// 每个区域的基础环境参数
const zoneBase = {
  'A区·办公楼主楼': { temp: 24.0, humidity: 50, pm25: 16, co2: 450, energy: 120 },
  'B区·研发中心':   { temp: 23.5, humidity: 45, pm25: 12, co2: 400, energy: 150 },
  'C区·生产厂房':   { temp: 27.0, humidity: 60, pm25: 40, co2: 650, energy: 280 },
  'D区·物流仓库':   { temp: 25.5, humidity: 53, pm25: 28, co2: 500, energy: 90 },
  'E区·地下车库':   { temp: 22.0, humidity: 68, pm25: 25, co2: 800, energy: 60 },
  'F区·员工食堂':   { temp: 25.0, humidity: 56, pm25: 20, co2: 530, energy: 100 },
}

// 全局统计基础值
let stats = {
  devices: 1286, online: 1267, offline: 19,
  alertsToday: 23, alertsResolved: 18,
  energyToday: 4820, energyYesterday: 4979,
  visitorsToday: 1847, visitorsYesterday: 2103,
  parkingTotal: 860, parkingUsed: 623,
}

// 设备类型统计
let deviceTypeStats = [
  { name: '视频监控', total: 320, online: 316 },
  { name: '环境传感器', total: 186, online: 185 },
  { name: '门禁设备', total: 48, online: 46 },
  { name: '消防设备', total: 156, online: 152 },
  { name: '照明系统', total: 576, online: 568 },
]

// 24 小时能耗趋势（滑动窗口）
let energyTrend = [
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
]

// 告警池
const alertTemplates = [
  { device: '烟感传感器 #A12', location: 'C区·3号厂房', level: 'danger', label: '紧急', desc: '烟雾浓度超标 {val} 倍' },
  { device: '水位监测 #B07', location: 'E区·地下车库B2', level: 'warn', label: '警告', desc: '水位超过警戒线 {val}cm' },
  { device: '变压器 #T01', location: 'C区·配电房', level: 'warn', label: '警告', desc: '三相电流不平衡 {val}%' },
  { device: '消防泵 #P05', location: 'C区·消防站', level: 'danger', label: '紧急', desc: '泵体压力异常下降 {val}%' },
  { device: '温湿度传感器 #H12', location: 'B区·数据中心', level: 'warn', label: '警告', desc: '温度超过 {val}°C 阈值' },
]

let alerts = []
let alertIdCounter = 100

// ==================== 波动模拟 ====================

function fluctuate(val, range) {
  return +(val + (Math.random() - 0.5) * range * 2).toFixed(1)
}

function generateEnv() {
  return ZONES.map(zone => {
    const base = zoneBase[zone]
    const temp = fluctuate(base.temp, 1.5)
    const humidity = fluctuate(base.humidity, 3)
    const pm25 = Math.max(0, fluctuate(base.pm25, 8))
    const co2 = Math.max(300, fluctuate(base.co2, 40))
    const energy = Math.max(0, fluctuate(base.energy, 15))

    // 状态判定
    let status = 'good'
    if (pm25 > 55 || co2 > 850 || temp > 30) status = 'danger'
    else if (pm25 > 40 || co2 > 700 || temp > 28 || humidity > 65 || humidity < 30) status = 'warn'

    return { zone, temp: +temp.toFixed(1), humidity: +humidity.toFixed(1), pm25: +pm25.toFixed(0), co2: +co2.toFixed(0), energy: +energy.toFixed(1), status }
  })
}

// ==================== 智能故障诊断 ====================

function diagnose(envData) {
  const results = []

  for (const e of envData) {
    const issues = []

    if (e.pm25 > 55) {
      issues.push({ metric: 'PM2.5', value: e.pm25, unit: 'μg/m³', threshold: '55 μg/m³', severity: 'danger',
        cause: '可能由生产厂房粉尘扩散或外部污染空气渗入导致', suggestion: '建议启动空气净化设备，检查厂房除尘系统运行状态，必要时通知人员佩戴防护口罩' })
    } else if (e.pm25 > 40) {
      issues.push({ metric: 'PM2.5', value: e.pm25, unit: 'μg/m³', threshold: '40 μg/m³', severity: 'warn',
        cause: '颗粒物浓度偏高，可能受生产活动或通风不畅影响', suggestion: '建议加强通风换气，检查新风系统滤网是否需要更换' })
    }

    if (e.co2 > 850) {
      issues.push({ metric: 'CO₂', value: e.co2, unit: 'ppm', threshold: '850 ppm', severity: 'danger',
        cause: '通风量严重不足或人员密度过高', suggestion: '立即启动强排风系统，检查新风机组运行状态，必要时限制区域人员数量' })
    } else if (e.co2 > 700) {
      issues.push({ metric: 'CO₂', value: e.co2, unit: 'ppm', threshold: '700 ppm', severity: 'warn',
        cause: '室内通风不足，CO₂ 浓度持续上升', suggestion: '建议增大新风量，开启排风扇，定期检查通风管道畅通性' })
    }

    if (e.temp > 30) {
      issues.push({ metric: '温度', value: e.temp, unit: '°C', threshold: '30°C', severity: 'danger',
        cause: '制冷系统能力不足或设备散热异常', suggestion: '立即检查空调制冷机组运行参数，排查大功率设备散热情况，必要时启用备用制冷设备' })
    } else if (e.temp > 28) {
      issues.push({ metric: '温度', value: e.temp, unit: '°C', threshold: '28°C', severity: 'warn',
        cause: '环境温度偏高，可能影响设备稳定运行', suggestion: '建议调节空调设定温度，检查冷却塔和冷冻水循环系统' })
    }

    if (e.humidity > 65) {
      issues.push({ metric: '湿度', value: e.humidity, unit: '%', threshold: '65%', severity: 'warn',
        cause: '湿度过高可能导致设备腐蚀和霉菌滋生', suggestion: '启动除湿设备，检查区域防水防潮措施，排查管道渗漏' })
    } else if (e.humidity < 30) {
      issues.push({ metric: '湿度', value: e.humidity, unit: '%', threshold: '30%', severity: 'warn',
        cause: '空气过于干燥，易产生静电风险', suggestion: '建议开启加湿设备，保持适宜湿度范围（40%-60%）' })
    }

    // 如果有问题，生成诊断记录
    for (const issue of issues) {
      results.push({
        id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        zone: e.zone,
        device: `环境传感器·${e.zone.split('·')[0]}`,
        metric: issue.metric,
        value: issue.value,
        unit: issue.unit,
        threshold: issue.threshold,
        severity: issue.severity,
        cause: issue.cause,
        suggestion: issue.suggestion,
        timestamp: new Date().toISOString(),
      })
    }
  }
  return results
}

// ==================== 告警生成 ====================

function generateAlerts(envData) {
  // 偶尔新增告警
  if (Math.random() < 0.15) {
    const tpl = alertTemplates[Math.floor(Math.random() * alertTemplates.length)]
    const rangeMap = { danger: [2, 5], warn: [10, 30] }
    const [min, max] = rangeMap[tpl.level] || [1, 10]
    alerts.unshift({
      id: ++alertIdCounter,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      device: tpl.device,
      location: tpl.location,
      level: tpl.level,
      label: tpl.label,
      status: 'pending',
      desc: tpl.desc.replace('{val}', (Math.random() * (max - min) + min).toFixed(1)),
    })
  }

  // 根据环境数据生成告警
  for (const e of envData) {
    if (e.status === 'danger' && Math.random() < 0.1) {
      const name = e.zone.split('·')[1] || e.zone
      alerts.unshift({
        id: ++alertIdCounter,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        device: `环境监测·${name}`,
        location: e.zone,
        level: 'danger',
        label: '紧急',
        status: 'pending',
        desc: `${e.zone} PM2.5=${e.pm25}μg/m³ CO₂=${e.co2}ppm 超标`,
      })
    }
  }

  // 随机处理一些待处理告警
  for (const a of alerts) {
    if (a.status === 'pending' && Math.random() < 0.08) a.status = 'processing'
    if (a.status === 'processing' && Math.random() < 0.05) a.status = 'resolved'
  }

  // 保持告警列表不超过 50 条
  if (alerts.length > 50) alerts = alerts.slice(0, 50)
  stats.alertsToday = alerts.filter(a => a.status !== 'resolved').length
  stats.alertsResolved = alerts.filter(a => a.status === 'resolved').length
}

// ==================== 主推送循环 ====================

function buildPayload() {
  // 波动全局统计
  stats.online = Math.round(stats.devices * (0.975 + Math.random() * 0.02))
  stats.offline = stats.devices - stats.online
  stats.energyToday += Math.round(Math.random() * 60 - 30)
  if (stats.energyToday < 4000) stats.energyToday = 4000
  stats.visitorsToday += Math.round(Math.random() * 10 - 1)
  if (stats.visitorsToday < 1500) stats.visitorsToday = 1500
  stats.parkingUsed += Math.round(Math.random() * 6 - 3)
  if (stats.parkingUsed < 500) stats.parkingUsed = 500
  if (stats.parkingUsed > stats.parkingTotal) stats.parkingUsed = stats.parkingTotal
  stats.devices += Math.round(Math.random() * 4 - 2)

  // 波动设备类型统计
  for (const dt of deviceTypeStats) {
    dt.online = Math.round(dt.total * (0.97 + Math.random() * 0.03))
    if (dt.online > dt.total) dt.online = dt.total
  }

  // 生成环境数据
  const env = generateEnv()

  // 更新能耗趋势（滑动窗口）
  const now = new Date()
  const timeLabel = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const avgEnv = env.reduce((a, e) => ({ temp: a.temp + e.temp / env.length, humidity: a.humidity + e.humidity / env.length }), { temp: 0, humidity: 0 })
  energyTrend.push({ time: timeLabel, energy: stats.energyToday % 500 + 100, temp: +avgEnv.temp.toFixed(1), humidity: +avgEnv.humidity.toFixed(1) })
  if (energyTrend.length > 24) energyTrend.shift()

  // 生成告警
  generateAlerts(env)

  // 故障诊断
  const diagnosis = diagnose(env)

  return {
    type: 'iot_data',
    timestamp: now.toISOString(),
    stats: { ...stats },
    energyTrend: [...energyTrend],
    env,
    deviceTypeStats: deviceTypeStats.map(d => ({ ...d })),
    alerts: alerts.slice(0, 20),
    diagnosis,
  }
}

// ==================== WebSocket 处理 ====================

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress
  console.log(`🔗 客户端连接: ${clientIp}  |  当前连接数: ${wss.clients.size}`)

  // 连接时立即发送一次数据
  try {
    ws.send(JSON.stringify(buildPayload()))
  } catch (e) {
    console.error('初始发送失败:', e.message)
  }

  ws.on('close', () => {
    console.log(`❌ 客户端断开: ${clientIp}  |  当前连接数: ${wss.clients.size}`)
  })

  ws.on('error', (err) => {
    console.error(`⚠️ 连接错误 (${clientIp}):`, err.message)
  })
})

// 每秒广播一次
setInterval(() => {
  if (wss.clients.size === 0) return
  const payload = JSON.stringify(buildPayload())
  for (const client of wss.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(payload)
      } catch (e) {
        console.error('广播发送失败:', e.message)
      }
    }
  }
}, 1000)

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭 WebSocket 服务...')
  wss.close(() => {
    console.log('✅ 服务已关闭')
    process.exit(0)
  })
})
