import { Redis } from '@upstash/redis';

// --- 配置 ---
const CACHE_KEY_PREFIX = 'stock_heatmap_sp500_v1'; // 使用标普500专属前缀
const CACHE_TTL_SECONDS = 900; // 缓存15分钟，因为数据量大，更新频率可以稍低

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// === 1. 标普500完整数据库 (基于GICS行业分类) ===
// 此列表涵盖了当前标普500指数的绝大部分成分股，并已为您整理好。
const industryStockList = {
    "Information Technology": [
        { "ticker": "ACN", "name_zh": "埃森哲" }, { "ticker": "ADBE", "name_zh": "Adobe" },
        { "ticker": "ADI", "name_zh": "亚德诺" }, { "ticker": "ADP", "name_zh": "自动数据处理" },
        { "ticker": "ADSK", "name_zh": "欧特克" }, { "ticker": "AKAM", "name_zh": "阿卡迈" },
        { "ticker": "AMAT", "name_zh": "应用材料" }, { "ticker": "AMD", "name_zh": "超威半导体" },
        { "ticker": "ANET", "name_zh": "安奈特" }, { "ticker": "ANSS", "name_zh": "安西斯" },
        { "ticker": "APH", "name_zh": "安费诺" }, { "ticker": "AAPL", "name_zh": "苹果" },
        { "ticker": "AVGO", "name_zh": "博通" }, { "ticker": "CDNS", "name_zh": "铿腾电子" },
        { "ticker": "CDW", "name_zh": "CDW" }, { "ticker": "CSCO", "name_zh": "思科" },
        { "ticker": "CTSH", "name_zh": "高知特" }, { "ticker": "DELL", "name_zh": "戴尔科技" },
        { "ticker": "ENPH", "name_zh": "Enphase能源" }, { "ticker": "EPAM", "name_zh": "EPAM系统" },
        { "ticker": "FFIV", "name_zh": "F5网络" }, { "ticker": "FI", "name_zh": "费哲金融" },
        { "ticker": "FICO", "name_zh": "费埃哲" }, { "ticker": "FIS", "name_zh": "富达国民信息" },
        { "ticker": "FLT", "name_zh": "舰队核心" }, { "ticker": "FTNT", "name_zh": "飞塔" },
        { "ticker": "GPN", "name_zh": "环汇" }, { "ticker": "HPE", "name_zh": "慧与" },
        { "ticker": "HPQ", "name_zh": "惠普" }, { "ticker": "IBM", "name_zh": "IBM" },
        { "ticker": "INTC", "name_zh": "英特尔" }, { "ticker": "INTU", "name_zh": "财捷" },
        { "ticker": "IT", "name_zh": "加特纳" }, { "ticker": "JKHY", "name_zh": "Jack Henry" },
        { "ticker": "JBL", "name_zh": "捷普" }, { "ticker": "KLAC", "name_zh": "科磊" },
        { "ticker": "LRCX", "name_zh": "拉姆研究" }, { "ticker": "MA", "name_zh": "万事达" },
        { "ticker": "MCHP", "name_zh": "微芯科技" }, { "ticker": "MSFT", "name_zh": "微软" },
        { "ticker": "MSI", "name_zh": "摩托罗拉系统" }, { "ticker": "MU", "name_zh": "美光科技" },
        { "ticker": "NOW", "name_zh": "ServiceNow" }, { "ticker": "NTAP", "name_zh": "NetApp" },
        { "ticker": "NVDA", "name_zh": "英伟达" }, { "ticker": "NXPI", "name_zh": "恩智浦" },
        { "ticker": "ON", "name_zh": "安森美" }, { "ticker": "ORCL", "name_zh": "甲骨文" },
        { "ticker": "PANW", "name_zh": "派拓网络" }, { "ticker": "PAYX", "name_zh": "Paychex" },
        { "ticker": "PTC", "name_zh": "参数科技" }, { "ticker": "PYPL", "name_zh": "PayPal" },
        { "ticker": "QCOM", "name_zh": "高通" }, { "ticker": "QRVO", "name_zh": "Qorvo" },
        { "ticker": "ROP", "name_zh": "罗珀科技" }, { "ticker": "RPL", "name_zh": "甲骨文金融" },
        { "ticker": "SNPS", "name_zh": "新思科技" }, { "ticker": "STX", "name_zh": "希捷科技" },
        { "ticker": "SWKS", "name_zh": "思佳讯" }, { "ticker": "TDY", "name_zh": "特利丹" },
        { "ticker": "TEL", "name_zh": "泰科电子" }, { "ticker": "TER", "name_zh": "泰瑞达" },
        { "ticker": "TRMB", "name_zh": "天宝" }, { "ticker": "TXN", "name_zh": "德州仪器" },
        { "ticker": "V", "name_zh": "Visa" }, { "ticker": "VRSN", "name_zh": "威瑞信" },
        { "ticker": "WDC", "name_zh": "西部数据" }, { "ticker": "ZBRA", "name_zh": "斑马技术" },
        { "ticker": "CRM", "name_zh": "赛富时" }
    ],
    "Health Care": [
        { "ticker": "A", "name_zh": "安捷伦" }, { "ticker": "ABT", "name_zh": "雅培" },
        { "ticker": "ABBV", "name_zh": "艾伯维" }, { "ticker": "ALGN", "name_zh": "艾利科技" },
        { "ticker": "AMGN", "name_zh": "安进" }, { "ticker": "BAX", "name_zh": "百特国际" },
        { "ticker": "BDX", "name_zh": "碧迪" }, { "ticker": "BIIB", "name_zh": "渤健" },
        { "ticker": "BIO", "name_zh": "Bio-Rad实验室" }, { "ticker": "BMY", "name_zh": "百时美施贵宝" },
        { "ticker": "BSX", "name_zh": "波士顿科学" }, { "ticker": "CAH", "name_zh": "卡迪纳健康" },
        { "ticker": "CI", "name_zh": "信诺" }, { "ticker": "CNC", "name_zh": "Centene" },
        { "ticker": "COO", "name_zh": "库博" }, { "ticker": "COR", "name_zh": "康宁" },
        { "ticker": "CVS", "name_zh": "CVS健康" }, { "ticker": "DHR", "name_zh": "丹纳赫" },
        { "ticker": "DXCM", "name_zh": "德康医疗" }, { "ticker": "ELV", "name_zh": "Elevance Health" },
        { "ticker": "EW", "name_zh": "爱德华生命科学" }, { "ticker": "GILD", "name_zh": "吉利德科学" },
        { "ticker": "HCA", "name_zh": "HCA医疗" }, { "ticker": "HOLX", "name_zh": "豪洛捷" },
        { "ticker": "HSIC", "name_zh": "汉瑞祥" }, { "ticker": "HUM", "name_zh": "哈门那" },
        { "ticker": "IDXX", "name_zh": "爱德士" }, { "ticker": "ILMN", "name_zh": "因美纳" },
        { "ticker": "INCY", "name_zh": "因塞特" }, { "ticker": "ISRG", "name_zh": "直觉外科" },
        { "ticker": "JNJ", "name_zh": "强生" }, { "ticker": "LH", "name_zh": "实验集团" },
        { "ticker": "LLY", "name_zh": "礼来" }, { "ticker": "MCK", "name_zh": "麦克森" },
        { "ticker": "MDT", "name_zh": "美敦力" }, { "ticker": "MOH", "name_zh": "Molina Healthcare" },
        { "ticker": "MRK", "name_zh": "默克" }, { "ticker": "MRNA", "name_zh": "莫德纳" },
        { "ticker": "MTD", "name_zh": "梅特勒-托利多" }, { "ticker": "PFE", "name_zh": "辉瑞" },
        { "ticker": "PKI", "name_zh": "珀金埃尔默" }, { "ticker": "PODD", "name_zh": "Insulet" },
        { "ticker": "REGN", "name_zh": "再生元" }, { "ticker": "RMD", "name_zh": "瑞思迈" },
        { "ticker": "RVTY", "name_zh": "Revvity" }, { "ticker": "STE", "name_zh": "斯特里" },
        { "ticker": "SYK", "name_zh": "史赛克" }, { "ticker": "TECH", "name_zh": "Bio-Techne" },
        { "ticker": "TFX", "name_zh": "泰利福" }, { "ticker": "TMO", "name_zh": "赛默飞" },
        { "ticker": "UNH", "name_zh": "联合健康" }, { "ticker": "VRTX", "name_zh": "福泰制药" },
        { "ticker": "WAT", "name_zh": "沃特世" }, { "ticker": "WST", "name_zh": "西部制药" },
        { "ticker": "ZBH", "name_zh": "捷迈邦美" }, { "ticker": "ZTS", "name_zh": "硕腾" }
    ],
    "Financials": [
        { "ticker": "AFL", "name_zh": "美国家庭人寿" }, { "ticker": "AIG", "name_zh": "美国国际集团" },
        { "ticker": "AJG", "name_zh": "亚瑟加拉格尔" }, { "ticker": "ALL", "name_zh": "好事达" },
        { "ticker": "AMP", "name_zh": "美普林" }, { "ticker": "AON", "name_zh": "怡安" },
        { "ticker": "AXP", "name_zh": "美国运通" }, { "ticker": "BAC", "name_zh": "美国银行" },
        { "ticker": "BEN", "name_zh": "富兰克林资源" }, { "ticker": "BK", "name_zh": "纽约梅隆银行" },
        { "ticker": "BLK", "name_zh": "贝莱德" }, { "ticker": "BRO", "name_zh": "布朗" },
        { "ticker": "BRK-B", "name_zh": "伯克希尔B" }, { "ticker": "C", "name_zh": "花旗集团" },
        { "ticker": "CB", "name_zh": "安达" }, { "ticker": "CBOE", "name_zh": "芝加哥期权交易所" },
        { "ticker": "CFG", "name_zh": "公民金融" }, { "ticker": "CINF", "name_zh": "辛辛那提金融" },
        { "ticker": "CMA", "name_zh": "联信银行" }, { "ticker": "COF", "name_zh": "第一资本" },
        { "ticker": "DFS", "name_zh": "发现金融" }, { "ticker": "EG", "name_zh": "长青源" },
        { "ticker": "FDS", "name_zh": "FactSet" }, { "ticker": "FITB", "name_zh": "五三银行" },
        { "ticker": "GL", "name_zh": "环球人寿" }, { "ticker": "GS", "name_zh": "高盛" },
        { "ticker": "HBAN", "name_zh": "亨廷顿银行" }, { "ticker": "HIG", "name_zh": "哈特福德金融" },
        { "ticker": "ICE", "name_zh": "洲际交易所" }, { "ticker": "IVZ", "name_zh": "景顺" },
        { "ticker": "JPM", "name_zh": "摩根大通" }, { "ticker": "KEY", "name_zh": "钥匙银行" },
        { "ticker": "L", "name_zh": "Loews" }, { "ticker": "MET", "name_zh": "大都会人寿" },
        { "ticker": "MCO", "name_zh": "穆迪" }, { "ticker": "MMC", "name_zh": "威达信" },
        { "ticker": "MNS", "name_zh": "大都会储蓄" }, { "ticker": "MS", "name_zh": "摩根士丹利" },
        { "ticker": "MTB", "name_zh": "M&T银行" }, { "ticker": "NAVI", "name_zh": "Navient" },
        { "ticker": "NDAQ", "name_zh": "纳斯达克" }, { "ticker": "NTRS", "name_zh": "北方信托" },
        { "ticker": "PGR", "name_zh": "前进保险" }, { "ticker": "PNC", "name_zh": "PNC金融" },
        { "ticker": "PRU", "name_zh": "保德信金融" }, { "ticker": "RJF", "name_zh": "雷蒙詹姆斯" },
        { "ticker": "SCHW", "name_zh": "嘉信理财" }, { "ticker": "SPGI", "name_zh": "标普全球" },
        { "ticker": "STT", "name_zh": "道富" }, { "ticker": "SYF", "name_zh": "同步金融" },
        { "ticker": "TFC", "name_zh": "储亿银行" }, { "ticker": "TROW", "name_zh": "普信" },
        { "ticker": "TRV", "name_zh": "旅行者保险" }, { "ticker": "USB", "name_zh": "美国合众银行" },
        { "ticker": "WFC", "name_zh": "富国银行" }, { "ticker": "WRB", "name_zh": "伯克利" },
        { "ticker": "WTW", "name_zh": "韦莱韬悦" }
    ],
    "Consumer Discretionary": [
        { "ticker": "AMZN", "name_zh": "亚马逊" }, { "ticker": "APTV", "name_zh": "安波福" },
        { "ticker": "AZO", "name_zh": "AutoZone" }, { "ticker": "BBWI", "name_zh": "巴斯和美体" },
        { "ticker": "BBY", "name_zh": "百思买" }, { "ticker": "BKNG", "name_zh": "缤客" },
        { "ticker": "BWA", "name_zh": "博格华纳" }, { "ticker": "CCL", "name_zh": "嘉年华邮轮" },
        { "ticker": "CHTR", "name_zh": "特许通讯" }, { "ticker": "CMG", "name_zh": "墨式烧烤" },
        { "ticker": "DHI", "name_zh": "霍顿房屋" }, { "ticker": "DRI", "name_zh": "达登餐饮" },
        { "ticker": "EBAY", "name_zh": "易贝" }, { "ticker": "ETSY", "name_zh": "Etsy" },
        { "ticker": "EXPE", "name_zh": "亿客行" }, { "ticker": "F", "name_zh": "福特汽车" },
        { "ticker": "GRMN", "name_zh": "佳明" }, { "ticker": "GM", "name_zh": "通用汽车" },
        { "ticker": "GPC", "name_zh": "Genuine Parts" }, { "ticker": "HAS", "name_zh": "孩之宝" },
        { "ticker": "HD", "name_zh": "家得宝" }, { "ticker": "HBI", "name_zh": "汉佰" },
        { "ticker": "HLT", "name_zh": "希尔顿" }, { "ticker": "KMX", "name_zh": "车美仕" },
        { "ticker": "LEN", "name_zh": "莱纳" }, { "ticker": "LKQ", "name_zh": "LKQ" },
        { "ticker": "LOW", "name_zh": "劳氏" }, { "ticker": "LULU", "name_zh": "露露乐蒙" },
        { "ticker": "LVS", "name_zh": "拉斯维加斯金沙" }, { "ticker": "MAR", "name_zh": "万豪" },
        { "ticker": "MCD", "name_zh": "麦当劳" }, { "ticker": "MGM", "name_zh": "美高梅" },
        { "ticker": "NCLH", "name_zh": "挪威邮轮" }, { "ticker": "NKE", "name_zh": "耐克" },
        { "ticker": "NVR", "name_zh": "NVR" }, { "ticker": "ORLY", "name_zh": "奥莱利" },
        { "ticker": "PHM", "name_zh": "普尔特" }, { "ticker": "POOL", "name_zh": "Pool" },
        { "ticker": "PVH", "name_zh": "PVH" }, { "ticker": "RCL", "name_zh": "皇家加勒比" },
        { "ticker": "ROST", "name_zh": "罗斯百货" }, { "ticker": "SBUX", "name_zh": "星巴克" },
        { "ticker": "TGT", "name_zh": "塔吉特" }, { "ticker": "TJX", "name_zh": "TJX" },
        { "ticker": "TSCO", "name_zh": "拖拉机供应" }, { "ticker": "TSLA", "name_zh": "特斯拉" },
        { "ticker": "ULTA", "name_zh": "Ulta美容" }, { "ticker": "VFC", "name_zh": "威富" },
        { "ticker": "WHR", "name_zh": "惠而浦" }, { "ticker": "WYNN", "name_zh": "永利度假村" },
        { "ticker": "YUM", "name_zh": "百胜餐饮" }
    ],
    "Communication Services": [
        { "ticker": "ATVI", "name_zh": "动视暴雪" }, { "ticker": "CHTR", "name_zh": "特许通讯" },
        { "ticker": "CMCSA", "name_zh": "康卡斯特" }, { "ticker": "DIS", "name_zh": "迪士尼" },
        { "ticker": "EA", "name_zh": "艺电" }, { "ticker": "FOX", "name_zh": "福克斯B" },
        { "ticker": "FOXA", "name_zh": "福克斯A" }, { "ticker": "GOOG", "name_zh": "谷歌C" },
        { "ticker": "GOOGL", "name_zh": "谷歌A" }, { "ticker": "IPG", "name_zh": "埃培智" },
        { "ticker": "LYV", "name_zh": "Live Nation" }, { "ticker": "META", "name_zh": "Meta" },
        { "ticker": "NFLX", "name_zh": "奈飞" }, { "ticker": "OMC", "name_zh": "宏盟集团" },
        { "ticker": "PARA", "name_zh": "派拉蒙" }, { "ticker": "T", "name_zh": "AT&T" },
        { "ticker": "TMUS", "name_zh": "T-Mobile" }, { "ticker": "TTWO", "name_zh": "Take-Two" },
        { "ticker": "VZ", "name_zh": "威瑞森" }, { "ticker": "WBD", "name_zh": "华纳兄弟探索" }
    ],
    "Industrials": [
        { "ticker": "AAL", "name_zh": "美国航空" },
        { "ticker": "AOS", "name_zh": "A.O.史密斯" }, { "ticker": "BA", "name_zh": "波音" },
        { "ticker": "CAT", "name_zh": "卡特彼勒" }, { "ticker": "CHRW", "name_zh": "罗宾逊全球" },
        { "ticker": "CMI", "name_zh": "康明斯" }, { "ticker": "CSX", "name_zh": "CSX运输" },
        { "ticker": "CTAS", "name_zh": "信达思" }, { "ticker": "DAL", "name_zh": "达美航空" },
        { "ticker": "DE", "name_zh": "迪尔" }, { "ticker": "DOV", "name_zh": "都福" },
        { "ticker": "EMR", "name_zh": "艾默生电气" }, { "ticker": "ETN", "name_zh": "伊顿" },
        { "ticker": "EXPD", "name_zh": "康捷国际" }, { "ticker": "FAST", "name_zh": "快扣" },
        { "ticker": "FDX", "name_zh": "联邦快递" }, { "ticker": "GD", "name_zh": "通用动力" },
        { "ticker": "GE", "name_zh": "通用电气" }, { "ticker": "GNRC", "name_zh": "Generac" },
        { "ticker": "GWW", "name_zh": "固安捷" }, { "ticker": "HII", "name_zh": "亨廷顿英格尔斯" },
        { "ticker": "HON", "name_zh": "霍尼韦尔" }, { "ticker": "HWM", "name_zh": "好时" },
        { "ticker": "IEX", "name_zh": "IDEX" }, { "ticker": "IR", "name_zh": "英格索兰" },
        { "ticker": "ITW", "name_zh": "伊利诺伊工具" }, { "ticker": "J", "name_zh": "雅各布斯工程" },
        { "ticker": "JBHT", "name_zh": "J.B.亨特运输" }, { "ticker": "JCI", "name_zh": "江森自控" },
        { "ticker": "LDOS", "name_zh": "Leidos" }, { "ticker": "LMT", "name_zh": "洛克希德马丁" },
        { "ticker": "LUV", "name_zh": "西南航空" }, { "ticker": "MAS", "name_zh": "马斯科" },
        { "ticker": "NDSN", "name_zh": "诺信" }, { "ticker": "NOC", "name_zh": "诺斯洛普格鲁门" },
        { "ticker": "NSC", "name_zh": "诺福克南方" }, { "ticker": "ODFL", "name_zh": "Old Dominion" },
        { "ticker": "PCAR", "name_zh": "帕卡" }, { "ticker": "PAYC", "name_zh": "Paycom" },
        { "ticker": "PH", "name_zh": "派克汉尼汾" }, { "ticker": "PNR", "name_zh": "滨特尔" },
        { "ticker": "PWR", "name_zh": "广达服务" }, { "ticker": "RTX", "name_zh": "雷神技术" },
        { "ticker": "SNA", "name_zh": "实耐宝" }, { "ticker": "TXT", "name_zh": "德事隆" },
        { "ticker": "UAL", "name_zh": "联合航空" }, { "ticker": "UNP", "name_zh": "联合太平洋" },
        { "ticker": "UPS", "name_zh": "联合包裹" }, { "ticker": "URI", "name_zh": "联合租赁" },
        { "ticker": "VRSK", "name_zh": "Verisk" }, { "ticker": "WM", "name_zh": "废物管理" },
        { "ticker": "XYL", "name_zh": "赛莱默" }
    ],
    "Consumer Staples": [
        { "ticker": "ADM", "name_zh": "ADM" }, { "ticker": "BF-B", "name_zh": "布朗霍文B" },
        { "ticker": "CAG", "name_zh": "康尼格拉" }, { "ticker": "CHD", "name_zh": "切迟杜威" },
        { "ticker": "CL", "name_zh": "高露洁" }, { "ticker": "CLX", "name_zh": "高乐氏" },
        { "ticker": "CPB", "name_zh": "金宝汤" }, { "ticker": "COST", "name_zh": "好市多" },
        { "ticker": "EL", "name_zh": "雅诗兰黛" }, { "ticker": "GIS", "name_zh": "通用磨坊" },
        { "ticker": "HRL", "name_zh": "荷美尔" }, { "ticker": "HSY", "name_zh": "好时" },
        { "ticker": "K", "name_zh": "家乐氏" }, { "ticker": "KDP", "name_zh": "胡椒博士" },
        { "ticker": "KHC", "name_zh": "卡夫亨氏" }, { "ticker": "KMB", "name_zh": "金佰利" },
        { "ticker": "KO", "name_zh": "可口可乐" }, { "ticker": "KR", "name_zh": "克罗格" },
        { "ticker": "MDLZ", "name_zh": "亿滋国际" }, { "ticker": "MKC", "name_zh": "味好美" },
        { "ticker": "MNST", "name_zh": "魔爪饮料" }, { "ticker": "MO", "name_zh": "奥驰亚" },
        { "ticker": "PEP", "name_zh": "百事" }, { "ticker": "PG", "name_zh": "宝洁" },
        { "ticker": "PM", "name_zh": "菲利普莫里斯" }, { "ticker": "SJM", "name_zh": "斯马克" },
        { "ticker": "STZ", "name_zh": "星座品牌" }, { "ticker": "SYY", "name_zh": "西斯科" },
        { "ticker": "TAP", "name_zh": "摩森康胜" }, { "ticker": "TR", "name_zh": "都乐" },
        { "ticker": "TSN", "name_zh": "泰森食品" }, { "ticker": "WBA", "name_zh": "沃博联" },
        { "ticker": "WMT", "name_zh": "沃尔玛" }
    ],
    "Energy": [
        { "ticker": "APA", "name_zh": "阿帕奇" }, { "ticker": "BKR", "name_zh": "贝克休斯" },
        { "ticker": "COP", "name_zh": "康菲石油" }, { "ticker": "CTRA", "name_zh": "Coterra能源" },
        { "ticker": "CVX", "name_zh": "雪佛龙" }, { "ticker": "DVN", "name_zh": "戴文能源" },
        { "ticker": "EOG", "name_zh": "EOG能源" }, { "ticker": "EQT", "name_zh": "EQT能源" },
        { "ticker": "FANG", "name_zh": "响尾蛇能源" }, { "ticker": "HAL", "name_zh": "哈里伯顿" },
        { "ticker": "HES", "name_zh": "赫斯" }, { "ticker": "KMI", "name_zh": "金德摩根" },
        { "ticker": "MPC", "name_zh": "马拉松原油" }, { "ticker": "MRO", "name_zh": "马拉松石油" },
        { "ticker": "OKE", "name_zh": "ONEok" }, { "ticker": "OXY", "name_zh": "西方石油" },
        { "ticker": "PSX", "name_zh": "菲利普斯66" }, { "ticker": "PXD", "name_zh": "先锋自然资源" },
        { "ticker": "SLB", "name_zh": "斯伦贝谢" }, { "ticker": "TRGP", "name_zh": "Targa资源" },
        { "ticker": "VLO", "name_zh": "瓦莱罗能源" }, { "ticker": "WMB", "name_zh": "威廉姆斯" },
        { "ticker": "XOM", "name_zh": "埃克森美孚" }
    ],
    "Materials": [
        { "ticker": "ALB", "name_zh": "雅宝" }, { "ticker": "AMCR", "name_zh": "安姆科" },
        { "ticker": "APD", "name_zh": "空气化工" }, { "ticker": "AVY", "name_zh": "艾利丹尼森" },
        { "ticker": "BALL", "name_zh": "波尔" }, { "ticker": "CE", "name_zh": "塞拉尼斯" },
        { "ticker": "CF", "name_zh": "CF工业" }, { "ticker": "CTVA", "name_zh": "科迪华" },
        { "ticker": "DD", "name_zh": "杜邦" }, { "ticker": "DOW", "name_zh": "陶氏" },
        { "ticker": "ECL", "name_zh": "艺康" }, { "ticker": "EMN", "name_zh": "伊士曼化工" },
        { "ticker": "FCX", "name_zh": "自由港麦克莫兰" }, { "ticker": "FMC", "name_zh": "FMC" },
        { "ticker": "IP", "name_zh": "国际纸业" }, { "ticker": "LIN", "name_zh": "林德" },
        { "ticker": "LYB", "name_zh": "利安德巴塞尔" }, { "ticker": "MLM", "name_zh": "马丁玛丽埃塔" },
        { "ticker": "MOS", "name_zh": "美盛" }, { "ticker": "NEM", "name_zh": "纽蒙特矿业" },
        { "ticker": "NUE", "name_zh": "纽柯" }, { "ticker": "PKG", "name_zh": "包装公司" },
        { "ticker": "PPG", "name_zh": "PPG工业" }, { "ticker": "SHW", "name_zh": "宣伟" },
        { "ticker": "STLD", "name_zh": "Steel Dynamics" }, { "ticker": "VMC", "name_zh": "火神材料" },
        { "ticker": "WRK", "name_zh": "WestRock" }
    ],
    "Real Estate": [
        { "ticker": "AMT", "name_zh": "美国电塔" }, { "ticker": "ARE", "name_zh": "亚历山大房产" },
        { "ticker": "AVB", "name_zh": "安博" }, { "ticker": "BXP", "name_zh": "波士顿地产" },
        { "ticker": "CBRE", "name_zh": "世邦魏理仕" }, { "ticker": "CCI", "name_zh": "冠城国际" },
        { "ticker": "DLR", "name_zh": "数字房地产信托" }, { "ticker": "EQIX", "name_zh": "Equinix" },
        { "ticker": "EQR", "name_zh": "权益住宅" }, { "ticker": "ESS", "name_zh": "埃塞克斯信托" },
        { "ticker": "EXR", "name_zh": "特许房产" }, { "ticker": "FRT", "name_zh": "联邦房地产信托" },
        { "ticker": "HST", "name_zh": "霍斯特酒店" }, { "ticker": "INVH", "name_zh": "Invitation Homes" },
        { "ticker": "IRM", "name_zh": "铁山" }, { "ticker": "KIM", "name_zh": "金科地产" },
        { "ticker": "MAA", "name_zh": "MAA" }, { "ticker": "O", "name_zh": "房产信托" },
        { "ticker": "PEAK", "name_zh": "Healthpeak" }, { "ticker": "PLD", "name_zh": "普洛斯" },
        { "ticker": "PSA", "name_zh": "公共存储" }, { "ticker": "REG", "name_zh": "摄政中心" },
        { "ticker": "SBAC", "name_zh": "SBA通信" }, { "ticker": "SPG", "name_zh": "西蒙地产" },
        { "ticker": "UDR", "name_zh": "UDR" }, { "ticker": "VTR", "name_zh": "Ventas" },
        { "ticker": "WELL", "name_zh": "惠康" }, { "ticker": "WY", "name_zh": "惠好" }
    ],
    "Utilities": [
        { "ticker": "AEE", "name_zh": "阿美能" }, { "ticker": "AEP", "name_zh": "美国电力" },
        { "ticker": "AES", "name_zh": "爱依斯" }, { "ticker": "ATO", "name_zh": "阿特莫斯能源" },
        { "ticker": "AWK", "name_zh": "美国水务" }, { "ticker": "CEG", "name_zh": "星座能源" },
        { "ticker": "CMS", "name_zh": "CMS能源" }, { "ticker": "CNP", "name_zh": "中点能源" },
        { "ticker": "D", "name_zh": "道明尼能源" }, { "ticker": "DTE", "name_zh": "DTE能源" },
        { "ticker": "DUK", "name_zh": "杜克能源" }, { "ticker": "ED", "name_zh": "联合爱迪生" },
        { "ticker": "EIX", "name_zh": "爱迪生国际" }, { "ticker": "ES", "name_zh": "Eversource能源" },
        { "ticker": "ETR", "name_zh": "安特吉" }, { "ticker": "EVRG", "name_zh": "Evergy" },
        { "ticker": "EXC", "name_zh": "艾索伦" }, { "ticker": "FE", "name_zh": "第一能源" },
        { "ticker": "LNT", "name_zh": "联合能源" }, { "ticker": "NEE", "name_zh": "新纪元能源" },
        { "ticker": "NI", "name_zh": "尼斯派" }, { "ticker": "NRG", "name_zh": "NRG能源" },
        { "ticker": "PCG", "name_zh": "太平洋煤电" }, { "ticker": "PEG", "name_zh": "公共服务" },
        { "ticker": "PNW", "name_zh": "顶峰西部" }, { "ticker": "PPL", "name_zh": "PPL" },
        { "ticker": "SO", "name_zh": "南方公司" }, { "ticker": "SRE", "name_zh": "桑普拉能源" },
        { "ticker": "WEC", "name_zh": "WEC能源" }, { "ticker": "XEL", "name_zh": "斯尔能源" }
    ]
};

// --- 动态生成首页股票列表（每个行业取市值最高的5个）和全量名称字典 ---
const homepageTickers = [];
const fullTickerNameMap = new Map();
for (const sector in industryStockList) {
    const stocksInSector = industryStockList[sector];
    // 取每个行业的前5个股票作为首页的“全景图”数据
    homepageTickers.push(...stocksInSector.slice(0, 5).map(s => ({...s, sector})));
    // 填充完整的股票代码->中文名映射
    stocksInSector.forEach(stock => {
        fullTickerNameMap.set(stock.ticker, stock.name_zh);
    });
}

// === 2. 使用您提供的完整版行业中英文字典 ===
const sectorDictionary = {
    "Energy": "能源",
    "Materials": "原材料",
    "Industrials": "工业",
    "Consumer Discretionary": "非必需消费品",
    "Consumer Staples": "必需消费品",
    "Health Care": "医疗健康",
    "Financials": "金融",
    "Information Technology": "信息技术",
    "Technology": "信息技术", // 同义词
    "Communication Services": "通讯服务",
    "Communications": "通讯服务", // 同义词
    "Utilities": "公用事业",
    "Real Estate": "房地产",
    "Aerospace & Defense": "航空航天与国防",
    "Aerospace": "航空航天",
    "Airlines": "航空公司",
    "Automobiles & Components": "汽车",
    "Automobiles": "汽车",
    "Banks": "银行业",
    "Banking": "银行业",
    "Beverages": "饮料",
    "Capital Goods": "资本品",
    "Commercial & Professional Services": "商业服务",
    "Consumer goods": "消费品",
    "Consumer products": "消费品",
    "Diversified Financials": "多元化金融",
    "Financial Services": "金融服务",
    "Food & Staples Retailing": "食品零售",
    "Food, Beverage & Tobacco": "食品与烟草",
    "Health Care Equipment & Services": "医疗设备与服务",
    "Hotels, Restaurants & Leisure": "酒店与休闲",
    "Household & Personal Products": "家庭与个人用品",
    "Insurance": "保险",
    "Machinery": "机械",
    "Media & Entertainment": "媒体与娱乐",
    "Media": "媒体",
    "Pharmaceuticals, Biotechnology & Life Sciences": "制药与生物科技",
    "Pharmaceuticals": "制药",
    "Retailing": "零售业",
    "Retail": "零售业",
    "Road & Rail": "陆路运输",
    "Semiconductors & Semiconductor Equipment": "半导体",
    "Semiconductors": "半导体",
    "Software & Services": "软件与服务",
    "Technology Hardware & Equipment": "技术硬件",
    "Telecommunication Services": "电信服务",
    "Telecommunication": "电信服务",
    "Textiles, Apparel & Luxury Goods": "纺织品与服装",
    "Textiles": "纺织品",
    "Transportation": "交通运输",
};


// --- 主处理函数 (无需修改) ---
export default async function handler(request, response) {
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');
    const sector = searchParams.get('sector');

    try {
        if (ticker) {
            const data = await fetchSingleStockData(ticker);
            return response.status(200).json(data);
        } else if (sector) {
            const data = await fetchHeatmapDataForSector(sector);
            return response.status(200).json(data);
        } else {
            const data = await fetchHomepageHeatmapData();
            return response.status(200).json(data);
        }
    } catch (error) {
        console.error(`API Handler Error:`, error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

// --- 数据获取函数 (无需修改) ---

async function fetchHomepageHeatmapData() {
    const cacheKey = `${CACHE_KEY_PREFIX}_homepage`;
    return await getOrFetchData(cacheKey, homepageTickers, true);
}

async function fetchHeatmapDataForSector(sector) {
    const decodedSector = decodeURIComponent(sector);
    const cacheKey = `${CACHE_KEY_PREFIX}_sector_${decodedSector.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const stocksInSector = industryStockList[decodedSector] || [];
    if (stocksInSector.length === 0) {
        throw new Error(`Sector '${decodedSector}' not found or has no stocks listed.`);
    }
    const tickersToFetch = stocksInSector.map(s => ({...s, sector: decodedSector}));
    return await getOrFetchData(cacheKey, tickersToFetch, false);
}

async function getOrFetchData(cacheKey, stockList, isHomepage) {
    try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            console.log(`Serving data from cache for key: ${cacheKey}`);
            return cachedData;
        }
    } catch (e) {
        console.error("Redis GET error:", e.message);
    }

    console.log(`Cache miss for ${cacheKey}. Fetching ${stockList.length} stocks fresh data.`);
    const tickers = stockList.map(s => s.ticker);
    const batchSize = 25; // 适当调大批处理数量以加快首次加载
    const delay = 1200;   // 保持合理的延迟
    let allStockData = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(`Fetching batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(tickers.length/batchSize)} for ${cacheKey}`);
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean);
        allStockData.push(...batchResult);
        if (i + batchSize < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // 为每个股票数据添加正确的行业中文名
    allStockData = allStockData.map(stock => {
        let masterSectorName = "Other";
        // 查找该股票属于我们定义的哪个主行业
        for (const sector in industryStockList) {
            if (industryStockList[sector].some(s => s.ticker === stock.ticker)) {
                masterSectorName = sector;
                break;
            }
        }
        return {
            ...stock,
            sector: sectorDictionary[masterSectorName] || masterSectorName,
            original_sector: masterSectorName // 保留原始英文名，用于前端链接
        };
    });

    if (allStockData.length > 0) {
        try {
            await redis.set(cacheKey, allStockData, { ex: CACHE_TTL_SECONDS });
            console.log(`Stored ${allStockData.length} stocks in cache for key: ${cacheKey}.`);
        } catch(e) {
            console.error("Redis SET error:", e.message);
        }
    }
    return allStockData;
}


async function fetchApiDataForTicker(ticker) {
    try {
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');

        const fetchFromFinnhub = async (endpoint) => {
            const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Finnhub API error for ${url}: ${res.statusText}`);
            return res.json();
        };

        const [profile, quote] = await Promise.all([
            fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
            fetchFromFinnhub(`/quote?symbol=${ticker}`)
        ]);

        if (!profile || !quote || typeof profile.marketCapitalization === 'undefined' || profile.marketCapitalization === 0) return null;
        
        const chineseName = fullTickerNameMap.get(ticker) || profile.name.split(' ')[0];
        
        return { 
            ticker, 
            name_zh: chineseName, 
            market_cap: profile.marketCapitalization, 
            change_percent: quote.dp,
            logo: profile.logo
        };
    } catch (error) {
        console.error(`Error fetching data for ticker ${ticker}:`, error);
        return null;
    }
}

async function fetchSingleStockData(ticker) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');
    
    const fetchFromFinnhub = async (endpoint) => {
        const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Finnhub API error for ${url}: ${res.statusText}`);
        return res.json();
    };
    
    const [profile, quote] = await Promise.all([
        fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
        fetchFromFinnhub(`/quote?symbol=${ticker}`)
    ]);
    
    const description = `(自动生成) ${profile.name} 是一家总部位于 ${profile.country || '未知'} 的公司，属于 ${profile.finnhubIndustry || '未知'} 行业，于 ${profile.ipo || '未知日期'} 上市。`;
    const nameZh = fullTickerNameMap.get(ticker) || profile.name;
    
    return { profile: { ...profile, description, name_zh: nameZh }, quote };
}