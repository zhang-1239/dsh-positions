/**
 * 首次启动写入的示例数据。装完第一眼不是空的。
 * 价格与当日盈亏都是「你自己填」的数字，不是行情。
 */
export default {
  version: 1,
  updatedAt: '2027-03-15',
  feeRate: 0.0003,
  feeRules: [
    {
      id: 'eastmoney',
      name: '东方财富（默认）',
      commissionRate: 0.00025,
      minCommission: 5,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
      otherFixed: 0,
      note: '佣金万 2.5、最低 5 元；卖出印花税 0.05%；过户费 0.001%。可在「费率」里按你的券商改。',
      image: ''
    }
  ],
  activeFeeRule: 'eastmoney',
  tags: ['量比/换手/振幅', '偏态', '趋势4项', '股东数', '全球流动性'],
  activeTags: [],
  calc: {},
  stocks: [
    {
      name: '示例股票A',
      group: '红',
      price: 10.42,
      dayPnl: 320,
      records: [
        { date: '2027-01-05', side: '买入', price: 10.0, qty: 1000 },
        { date: '2027-02-10', side: '买入', price: 9.5, qty: 500 },
        { date: '2027-03-02', side: '卖出', price: 11.0, qty: 300, feeOverride: 3.2 }
      ]
    },
    {
      name: '示例股票B',
      group: '红',
      price: 27.33,
      dayPnl: -150,
      records: [
        { date: '2027-01-12', side: '买入', price: 20.0, qty: 200 },
        { date: '2027-02-18', side: '买入', price: 18.5, qty: 100 }
      ]
    },
    {
      name: '示例股票C',
      group: '双底',
      price: 5.2,
      dayPnl: 210,
      records: [{ date: '2027-02-03', side: '买入', price: 5.2, qty: 2000 }]
    },
    {
      name: '示例股票D',
      group: '双底',
      price: 34.0,
      dayPnl: -90,
      records: [
        { date: '2027-01-20', side: '买入', price: 30.0, qty: 300 },
        { date: '2027-03-15', side: '卖出', price: 28.0, qty: 100 }
      ]
    },
    {
      name: '示例股票E',
      group: '',
      price: 12.0,
      dayPnl: 60,
      records: [{ date: '2027-02-22', side: '买入', price: 12.0, qty: 400 }]
    }
  ]
}
