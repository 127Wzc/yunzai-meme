import plugin from '../../lib/plugins/plugin.js'
import fetch, { FormData, File } from 'node-fetch'
import fs from 'fs'
import path from 'node:path'
import _ from 'lodash'
if (!global.segment) {
  global.segment = (await import('oicq')).segment
}
const baseUrl = 'https://memes.ikechan8370.com'
/**
 * 机器人发表情是否引用回复用户
 * @type {boolean}
 */
const reply = true
/**
 * 是否强制使用#触发命令
 */
const forceSharp = false
/**
 * 主人保护，撅主人时会被反撅
 * @type {boolean}
 */
const masterProtectDo = true
export class memes extends plugin {
  constructor () {
    let option = {
      /** 功能名称 */
      name: '表情包',
      /** 功能描述 */
      dsc: '表情包制作',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^(#)?(meme(s)?|表情包)列表$',
          /** 执行方法 */
          fnc: 'memesList'
        },
        {
          /** 命令正则匹配 */
          reg: '^#?随机(meme(s)?|表情包)',
          /** 执行方法 */
          fnc: 'randomMemes'
        },
        {
          /** 命令正则匹配 */
          reg: '^#?(meme(s)?|表情包)帮助',
          /** 执行方法 */
          fnc: 'memesHelp'
        },
        {
          /** 命令正则匹配 */
          reg: '^#?(meme(s)?|表情包)搜索',
          /** 执行方法 */
          fnc: 'memesSearch'
        }
      ]
    }
    Object.keys(keyMap).forEach(key => {
      let reg = forceSharp ? `^#${key}` : `^#?${key}`
      option.rule.push({
        /** 命令正则匹配 */
        reg,
        /** 执行方法 */
        fnc: 'memes'
      })
    })
    super(option)
  }

  async memesHelp (e) {
    e.reply('【memes列表】：查看支持的memes列表\n【{表情名称}】：memes列表中的表情名称，根据提供的文字或图片制作表情包\n【随机meme】：随机制作一些表情包\n【meme搜索+关键词】：搜索表情包关键词\n【{表情名称}+详情】：查看该表情所支持的参数')
  }

  async memesSearch (e) {
    let search = e.msg.replace(/^#?(meme(s)?|表情包)搜索/, '').trim()
    if (!search) {
      await e.reply('你要搜什么？')
      return true
    }
    let hits = Object.keys(keyMap).filter(k => k.indexOf(search) > -1)
    let result = '搜索结果'
    if (hits.length > 0) {
      for (let i = 0; i < hits.length; i++) {
        result += `\n${i + 1}. ${hits[i]}`
      }
    } else {
      result += '\n无'
    }
    await e.reply(result, e.isGroup)
  }

  async memesList (e) {
    mkdirs('data/memes')
    let resultFileLoc = 'data/memes/render_list1.jpg'
    if (fs.existsSync(resultFileLoc)) {
      await e.reply(segment.image(fs.createReadStream(resultFileLoc)))
      return true
    }
    let response = await fetch(baseUrl + '/memes/render_list', {
      method: 'POST'
    })
    const resultBlob = await response.blob()
    const resultArrayBuffer = await resultBlob.arrayBuffer()
    const resultBuffer = Buffer.from(resultArrayBuffer)
    await fs.writeFileSync(resultFileLoc, resultBuffer)
    await e.reply(segment.image(fs.createReadStream(resultFileLoc)))
    setTimeout(async () => {
      await fs.unlinkSync(resultFileLoc)
    }, 3600)
    return true
  }

  async randomMemes (e) {
    let keys = Object.keys(infos).filter(key => infos[key].params.min_images === 1 && infos[key].params.min_texts === 0)
    let index = _.random(0, keys.length - 1, false)
    console.log(keys, index)
    e.msg = infos[keys[index]].keywords[0]
    return await this.memes(e)
  }

  /**
   * #memes
   * @param e oicq传递的事件参数e
   */
  async memes (e) {
    // console.log(e)
    let msg = e.msg.replace('#', '')
    let keys = Object.keys(keyMap).filter(k => msg.startsWith(k))
    let target = keys[0]
    if (target === '玩' && msg.startsWith('玩游戏')) {
      target = '玩游戏'
    }
    if (target === '滚' && msg.startsWith('滚屏')) {
      target = '滚屏'
    }
    let targetCode = keyMap[target]
    // let target = e.msg.replace(/^#?meme(s)?/, '')
    let text1 = _.trimStart(e.msg, '#').replace(target, '')
    if (text1.trim() === '详情' || text1.trim() === '帮助') {
      await e.reply(detail(targetCode))
      return false
    }
    let [text, args = ''] = text1.split('#')
    let userInfos
    let formData = new FormData()
    let info = infos[targetCode]
    let fileLoc
    if (info.params.max_images > 0) {
      // 可以有图，来从回复、发送和头像找图
      let imgUrls = []
      if (e.source) {
        // 优先从回复找图
        let reply
        if (e.isGroup) {
          reply = (await e.group.getChatHistory(e.source.seq, 1)).pop()?.message
        } else {
          reply = (await e.friend.getChatHistory(e.source.time, 1)).pop()?.message
        }
        if (reply) {
          for (let val of reply) {
            if (val.type === 'image') {
              console.log(val)
              imgUrls.push(val.url)
            }
          }
        }
      } else if (e.img) {
        // 一起发的图
        imgUrls.push(...e.img)
      } else if (e.message.filter(m => m.type === 'at').length > 0) {
        // 艾特的用户的头像
        let ats = e.message.filter(m => m.type === 'at')
        imgUrls = ats.map(at => at.qq).map(qq => `https://q1.qlogo.cn/g?b=qq&s=0&nk=${qq}`)
      }
      if (!imgUrls || imgUrls.length === 0) {
        // 如果都没有，用发送者的头像
        imgUrls = [`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.sender.user_id}`]
      }
      if (imgUrls.length < info.params.min_images && imgUrls.indexOf(`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.sender.user_id}`) === -1) {
        // 如果数量不够，补上发送者头像，且放到最前面
        let me = [`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.sender.user_id}`]
        let done = false
        if (targetCode === 'do' && masterProtectDo) {
          let masters = await getMasterQQ()
          if (imgUrls[0].startsWith('https://q1.qlogo.cn')) {
            let split = imgUrls[0].split('=')
            let targetQQ = split[split.length - 1]
            if (masters.map(q => q + '').indexOf(targetQQ) > -1) {
              imgUrls = imgUrls.concat(me)
              done = true
            }
          }
        }
        if (!done) {
          imgUrls = me.concat(imgUrls)
        }
        // imgUrls.push(`https://q1.qlogo.cn/g?b=qq&s=0&nk=${e.msg.sender.user_id}`)
      }
      imgUrls = imgUrls.slice(0, Math.min(info.params.max_images, imgUrls.length))
      for (let i = 0; i < imgUrls.length; i++) {
        let imgUrl = imgUrls[i]
        const imageResponse = await fetch(imgUrl)
        const fileType = imageResponse.headers.get('Content-Type').split('/')[1]
        fileLoc = `data/memes/original/${Date.now()}.${fileType}`
        mkdirs('data/memes/original')
        const blob = await imageResponse.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        await fs.writeFileSync(fileLoc, buffer)
        formData.append('images', new File([buffer], `avatar_${i}.jpg`, { type: 'image/jpeg' }))
      }
    }
    if (text && info.params.max_texts === 0) {
      return false
    }
    if (!text && info.params.min_texts > 0) {
      if (e.message.filter(m => m.type === 'at').length > 0) {
        text = _.trim(e.message.filter(m => m.type === 'at')[0].text, '@')
      } else {
        text = e.sender.card || e.sender.nickname
      }
    }
    let texts = text.split('/', info.params.max_texts)
    if (texts.length < info.params.min_texts) {
      await e.reply(`字不够！要至少${info.params.min_texts}个用/隔开！`, true)
      return true
    }
    texts.forEach(t => {
      formData.append('texts', t)
    })
    if (info.params.max_texts > 0 && formData.getAll('texts').length === 0) {
      if (formData.getAll('texts').length < info.params.max_texts) {
        if (e.message.filter(m => m.type === 'at').length > 0) {
          formData.append('texts', _.trim(e.message.filter(m => m.type === 'at')[0].text, '@'))
        } else {
          formData.append('texts', e.sender.card || e.sender.nickname)
        }
      }
    }
    if (e.message.filter(m => m.type === 'at').length > 0) {
      userInfos = e.message.filter(m => m.type === 'at')
      let mm = await e.group.getMemberMap()
      userInfos.forEach(ui => {
        let user = mm.get(ui.qq)
        ui.gender = user.sex
        ui.text = user.card || user.nickname
      })
    }
    if (!userInfos) {
      userInfos = [{ text: e.sender.card || e.sender.nickname, gender: e.sender.sex }]
    }
    args = handleArgs(targetCode, args, userInfos)
    if (args) {
      formData.set('args', args)
    }
    console.log('input', { target, targetCode, images: formData.getAll('images'), texts: formData.getAll('texts'), args: formData.getAll('args') })
    let response = await fetch(baseUrl + '/memes/' + targetCode + '/', {
      method: 'POST',
      body: formData
      // headers: {
      // 'Content-Type': 'multipart/form-data'
      // }
    })
    // console.log(response.status)
    if (response.status > 299) {
      let error = await response.text()
      console.error(error)
      await e.reply(error, true)
      return true
    }
    mkdirs('data/memes/result')
    let resultFileLoc = `data/memes/result/${Date.now()}.jpg`
    const resultBlob = await response.blob()
    const resultArrayBuffer = await resultBlob.arrayBuffer()
    const resultBuffer = Buffer.from(resultArrayBuffer)
    await fs.writeFileSync(resultFileLoc, resultBuffer)
    await e.reply(segment.image(fs.createReadStream(resultFileLoc)), reply)
    fileLoc && await fs.unlinkSync(fileLoc)
    await fs.unlinkSync(resultFileLoc)
  }
}

function handleArgs (key, args, userInfos) {
  if (!args) {
    args = ''
  }
  let argsObj = {}
  switch (key) {
    case 'look_flat': {
      argsObj = { ratio: parseInt(args || '2') }
      break
    }
    case 'crawl': {
      argsObj = { number: parseInt(args) ? parseInt(args) : _.random(1, 92, false) }
      break
    }
    case 'symmetric': {
      let directionMap = {
        左: 'left',
        右: 'right',
        上: 'top',
        下: 'bottom'
      }
      argsObj = { direction: directionMap[args.trim()] || 'left' }
      break
    }
    case 'petpet':
    case 'jiji_king':
    case 'kirby_hammer': {
      argsObj = { circle: args.startsWith('圆') }
      break
    }
    case 'my_friend': {
      if (!args) {
        args = _.trim(userInfos[0].text, '@')
      }
      argsObj = { name: args }
      break
    }
    case 'looklook': {
      argsObj = { mirror: args === '翻转' }
      break
    }
    case 'always': {
      let modeMap = {
        '': 'normal',
        循环: 'loop',
        套娃: 'circle'
      }
      argsObj = { mode: modeMap[args] || 'normal' }
      break
    }
    case 'gun':
    case 'bubble_tea': {
      let directionMap = {
        左: 'left',
        右: 'right',
        两边: 'both'
      }
      argsObj = { position: directionMap[args.trim()] || 'right' }
      break
    }
  }
  argsObj.user_infos = userInfos.map(u => {
    return {
      name: _.trim(u.text, '@'),
      gender: u.gender
    }
  })
  return JSON.stringify(argsObj)
}

const keyMap = {
  '万能表情': 'universal',
  '空白表情': 'universal',
  '加班': 'overtime',
  '不喊我': 'not_call_me',
  '撕': 'rip',
  '滚': 'roll',
  '一样': 'alike',
  '迷惑': 'confuse',
  '兑换券': 'coupon',
  '看扁': 'look_flat',
  '拍头': 'beat_head',
  '诈尸': 'rise_dead',
  '秽土转生': 'rise_dead',
  '讲课': 'teach',
  '敲黑板': 'teach',
  '国旗': 'china_flag',
  '罗永浩说': 'luoyonghao_say',
  '看书': 'read_book',
  '怒撕': 'rip_angrily',
  '咖波撞': 'capoo_strike',
  '咖波头槌': 'capoo_strike',
  '字符画': 'charpic',
  '震惊': 'shock',
  '爬': 'crawl',
  '许愿失败': 'wish_fail',
  '紧贴': 'tightly',
  '紧紧贴着': 'tightly',
  '我老婆': 'my_wife',
  '这是我老婆': 'my_wife',
  '可莉吃': 'klee_eat',
  '王境泽': 'wangjingze',
  '为所欲为': 'weisuoyuwei',
  '馋身子': 'chanshenzi',
  '切格瓦拉': 'qiegewala',
  '谁反对': 'shuifandui',
  '曾小贤': 'zengxiaoxian',
  '压力大爷': 'yalidaye',
  '你好骚啊': 'nihaosaoa',
  '食屎啦你': 'shishilani',
  '五年怎么过的': 'wunian',
  '追列车': 'chase_train',
  '追火车': 'chase_train',
  '听音乐': 'listen_music',
  '打穿': 'hit_screen',
  '打穿屏幕': 'hit_screen',
  '波奇手稿': 'bocchi_draft',
  '对称': 'symmetric',
  '胡桃平板': 'walnut_pad',
  '等价无穷小': 'lim_x_0',
  '别碰': 'dont_touch',
  '二次元入口': 'acg_entrance',
  '快跑': 'run',
  '上瘾': 'addiction',
  '毒瘾发作': 'addiction',
  '抱大腿': 'hug_leg',
  '布洛妮娅举牌': 'bronya_holdsign',
  '大鸭鸭举牌': 'bronya_holdsign',
  '诺基亚': 'nokia',
  '有内鬼': 'nokia',
  '垃圾': 'garbage',
  '垃圾桶': 'garbage',
  '砸': 'smash',
  '唐可可举牌': 'tankuku_raisesign',
  '咖波说': 'capoo_say',
  '喜报': 'good_news',
  '滚屏': 'scroll',
  '吸': 'suck',
  '嗦': 'suck',
  '卡比锤': 'kirby_hammer',
  '卡比重锤': 'kirby_hammer',
  douyin: 'douyin',
  '结婚申请': 'marriage',
  '结婚登记': 'marriage',
  '拍': 'pat',
  '波纹': 'wave',
  '推锅': 'pass_the_buck',
  '甩锅': 'pass_the_buck',
  '抱紧': 'hold_tight',
  ph: 'pornhub',
  pornhub: 'pornhub',
  '咖波蹭': 'capoo_rub',
  '咖波贴': 'capoo_rub',
  '高血压': 'blood_pressure',
  '低情商xx高情商xx': 'high_EQ',
  '加载中': 'loading',
  '万花筒': 'kaleidoscope',
  '万花镜': 'kaleidoscope',
  '刮刮乐': 'scratchcard',
  '木鱼': 'wooden_fish',
  '胡桃放大': 'walnut_zoom',
  '亲': 'kiss',
  '亲亲': 'kiss',
  '鲁迅说': 'luxun_say',
  '鲁迅说过': 'luxun_say',
  '防诱拐': 'anti_kidnap',
  '一巴掌': 'slap',
  '无响应': 'no_response',
  '我朋友说': 'my_friend',
  '复读': 'repeat',
  '击剑': 'fencing',
  '🤺': 'fencing',
  '啾啾': 'jiujiu',
  '急急国王': 'jiji_king',
  '永远爱你': 'love_you',
  '采访': 'interview',
  '风车转': 'windmill_turn',
  '记仇': 'hold_grudge',
  '恍惚': 'trance',
  '不要靠近': 'dont_go_near',
  '小天使': 'little_angel',
  '安全感': 'safe_sense',
  '遇到困难请拨打': 'call_110',
  '捶爆': 'thump_wildly',
  '爆捶': 'thump_wildly',
  '鼓掌': 'applaud',
  '整点薯条': 'find_chips',
  '一直': 'always',
  '群青': 'cyan',
  '打拳': 'punch',
  '亚文化取名机': 'name_generator',
  '亚名': 'name_generator',
  '不文明': 'incivilization',
  '小画家': 'painter',
  '转': 'turn',
  '舔': 'prpr',
  '舔屏': 'prpr',
  prpr: 'prpr',
  '搓': 'twist',
  '低语': 'murmur',
  '贴': 'rub',
  '贴贴': 'rub',
  '蹭': 'rub',
  '蹭蹭': 'rub',
  '奶茶': 'bubble_tea',
  '踩': 'step_on',
  '坐得住': 'sit_still',
  '坐的住': 'sit_still',
  '丢': 'throw',
  '扔': 'throw',
  '捶': 'thump',
  '问问': 'ask',
  '口号': 'slogan',
  '土豆': 'potato',
  '请假条': 'note_for_leave',
  '捂脸': 'cover_face',
  '挠头': 'scratch_head',
  '咖波画': 'capoo_draw',
  '顶': 'play',
  '玩': 'play',
  '胡桃啃': 'hutao_bite',
  '看图标': 'look_this_icon',
  '啃': 'bite',
  yt: 'youtube',
  youtube: 'youtube',
  '手枪': 'gun',
  '出警': 'police',
  '警察': 'police1',
  '像样的亲亲': 'decent_kiss',
  '别说了': 'shutup',
  google: 'google',
  '抛': 'throw_gif',
  '掷': 'throw_gif',
  '举牌': 'raise_sign',
  '膜': 'worship',
  '膜拜': 'worship',
  '舰长': 'captain',
  '悲报': 'bad_news',
  '离婚协议': 'divorce',
  '离婚申请': 'divorce',
  '继续干活': 'back_to_work',
  '打工人': 'back_to_work',
  '踢球': 'kick_ball',
  '锤': 'hammer',
  '敲': 'knock',
  '偷学': 'learn',
  '5000兆': '5000choyen',
  '摸': 'petpet',
  '摸摸': 'petpet',
  '摸头': 'petpet',
  rua: 'petpet',
  '升天': 'ascension',
  '凯露指': 'karyl_point',
  '墙纸': 'wallpaper',
  '吃': 'eat',
  '玩游戏': 'play_game',
  '咖波撕': 'capoo_rip',
  '完美': 'perfect',
  '哈哈镜': 'funny_mirror',
  '注意力涣散': 'distracted',
  '交个朋友': 'make_friend',
  '吴京xx中国xx': 'wujing',
  '一起': 'together',
  '这像画吗': 'paint',
  '为什么@我': 'why_at_me',
  '管人痴': 'dog_of_vtb',
  '想什么': 'think_what',
  '狂爱': 'fanatic',
  '狂粉': 'fanatic',
  '精神支柱': 'support',
  '流星': 'meteor',
  '远离': 'keep_away',
  '阿尼亚喜欢': 'anya_suki',
  '需要': 'need',
  '你可能需要': 'need',
  '打印': 'printing',
  '恐龙': 'dinosaur',
  '小恐龙': 'dinosaur',
  '关注': 'follow',
  '坐牢': 'imprison',
  '入典': 'dianzhongdian',
  '典中典': 'dianzhongdian',
  '黑白草图': 'dianzhongdian',
  '可达鸭': 'psyduck',
  '我永远喜欢': 'always_like',
  'xx起来了': 'wakeup',
  '捣': 'pound',
  '猫羽雫举牌': 'nekoha_holdsign',
  '猫猫举牌': 'nekoha_holdsign',
  '看看你的': 'can_can_need',
  '撅': 'do',
  '狠狠地撅': 'do',
  '换位思考': 'empathy',
  '飞机杯': 'fleshlight',
  '禁止': 'forbid',
  '禁': 'forbid',
  '抓': 'grab',
  '瞧瞧你那样': 'looklook',
  '合成大干员': 'operator_generator',
  '双手': 'stretch',
  '伸展': 'stretch'
}

const detail = code => {
  let d = infos[code]
  let keywords = d.keywords.join('、')
  let ins = `【代码】${d.key}\n【名称】${keywords}\n【最大图片数量】${d.params.max_images}\n【最小图片数量】${d.params.min_images}\n【最大文本数量】${d.params.max_texts}\n【最小文本数量】${d.params.min_texts}\n【默认文本】${d.params.default_texts.join('/')}\n`
  if (d.params.args.length > 0) {
    let supportArgs = ''
    switch (code) {
      case 'look_flat': {
        supportArgs = '看扁率，数字.如#3'
        break
      }
      case 'crawl': {
        supportArgs = '爬的图片编号，1-92。如#33'
        break
      }
      case 'symmetric': {
        supportArgs = '方向，上下左右。如#下'
        break
      }
      case 'petpet':
      case 'jiji_king':
      case 'kirby_hammer': {
        supportArgs = '是否圆形头像，输入圆即可。如#圆'
        break
      }
      case 'always': {
        supportArgs = '一直图像的渲染模式，循环、套娃、默认。不填参数即默认。如一直#循环'
        break
      }
      case 'gun':
      case 'bubble_tea': {
        supportArgs = '方向，左、右、两边。如#两边'
        break
      }
    }
    ins += `【支持参数】${supportArgs}`
  }
  return ins
}

const infos = {
  universal: {
    key: 'universal',
    keywords: [ '万能表情', '空白表情' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 1,
      max_texts: 10,
      default_texts: [Array],
      args: []
    }
  },
  overtime: {
    key: 'overtime',
    keywords: [ '加班' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  not_call_me: {
    key: 'not_call_me',
    keywords: [ '不喊我' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  rip: {
    key: 'rip',
    keywords: [ '撕' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 2,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  roll: {
    key: 'roll',
    keywords: [ '滚' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  alike: {
    key: 'alike',
    keywords: [ '一样' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  confuse: {
    key: 'confuse',
    keywords: [ '迷惑' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  coupon: {
    key: 'coupon',
    keywords: [ '兑换券' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  look_flat: {
    key: 'look_flat',
    keywords: [ '看扁' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: [Array]
    }
  },
  beat_head: {
    key: 'beat_head',
    keywords: [ '拍头' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  rise_dead: {
    key: 'rise_dead',
    keywords: [ '诈尸', '秽土转生' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  teach: {
    key: 'teach',
    keywords: [ '讲课', '敲黑板' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  china_flag: {
    key: 'china_flag',
    keywords: [ '国旗' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  luoyonghao_say: {
    key: 'luoyonghao_say',
    keywords: [ '罗永浩说' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  read_book: {
    key: 'read_book',
    keywords: [ '看书' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  rip_angrily: {
    key: 'rip_angrily',
    keywords: [ '怒撕' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  capoo_strike: {
    key: 'capoo_strike',
    keywords: [ '咖波撞', '咖波头槌' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  charpic: {
    key: 'charpic',
    keywords: [ '字符画' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  shock: {
    key: 'shock',
    keywords: [ '震惊' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  crawl: {
    key: 'crawl',
    keywords: [ '爬' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  wish_fail: {
    key: 'wish_fail',
    keywords: [ '许愿失败' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  tightly: {
    key: 'tightly',
    keywords: [ '紧贴', '紧紧贴着' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  my_wife: {
    key: 'my_wife',
    keywords: [ '我老婆', '这是我老婆' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  klee_eat: {
    key: 'klee_eat',
    keywords: [ '可莉吃' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  wangjingze: {
    key: 'wangjingze',
    keywords: [ '王境泽' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 4,
      max_texts: 4,
      default_texts: [Array],
      args: []
    }
  },
  weisuoyuwei: {
    key: 'weisuoyuwei',
    keywords: [ '为所欲为' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 9,
      max_texts: 9,
      default_texts: [Array],
      args: []
    }
  },
  chanshenzi: {
    key: 'chanshenzi',
    keywords: [ '馋身子' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 3,
      max_texts: 3,
      default_texts: [Array],
      args: []
    }
  },
  qiegewala: {
    key: 'qiegewala',
    keywords: [ '切格瓦拉' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 6,
      max_texts: 6,
      default_texts: [Array],
      args: []
    }
  },
  shuifandui: {
    key: 'shuifandui',
    keywords: [ '谁反对' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 4,
      max_texts: 4,
      default_texts: [Array],
      args: []
    }
  },
  zengxiaoxian: {
    key: 'zengxiaoxian',
    keywords: [ '曾小贤' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 4,
      max_texts: 4,
      default_texts: [Array],
      args: []
    }
  },
  yalidaye: {
    key: 'yalidaye',
    keywords: [ '压力大爷' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 3,
      max_texts: 3,
      default_texts: [Array],
      args: []
    }
  },
  nihaosaoa: {
    key: 'nihaosaoa',
    keywords: [ '你好骚啊' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 3,
      max_texts: 3,
      default_texts: [Array],
      args: []
    }
  },
  shishilani: {
    key: 'shishilani',
    keywords: [ '食屎啦你' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 4,
      max_texts: 4,
      default_texts: [Array],
      args: []
    }
  },
  wunian: {
    key: 'wunian',
    keywords: [ '五年怎么过的' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 4,
      max_texts: 4,
      default_texts: [Array],
      args: []
    }
  },
  chase_train: {
    key: 'chase_train',
    keywords: [ '追列车', '追火车' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  listen_music: {
    key: 'listen_music',
    keywords: [ '听音乐' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  hit_screen: {
    key: 'hit_screen',
    keywords: [ '打穿', '打穿屏幕' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  bocchi_draft: {
    key: 'bocchi_draft',
    keywords: [ '波奇手稿' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  symmetric: {
    key: 'symmetric',
    keywords: [ '对称' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  walnut_pad: {
    key: 'walnut_pad',
    keywords: [ '胡桃平板' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  lim_x_0: {
    key: 'lim_x_0',
    keywords: [ '等价无穷小' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  dont_touch: {
    key: 'dont_touch',
    keywords: [ '别碰' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  acg_entrance: {
    key: 'acg_entrance',
    keywords: [ '二次元入口' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  run: {
    key: 'run',
    keywords: [ '快跑' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  addiction: {
    key: 'addiction',
    keywords: [ '上瘾', '毒瘾发作' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  hug_leg: {
    key: 'hug_leg',
    keywords: [ '抱大腿' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  bronya_holdsign: {
    key: 'bronya_holdsign',
    keywords: [ '布洛妮娅举牌', '大鸭鸭举牌' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  nokia: {
    key: 'nokia',
    keywords: [ '诺基亚', '有内鬼' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  garbage: {
    key: 'garbage',
    keywords: [ '垃圾', '垃圾桶' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  smash: {
    key: 'smash',
    keywords: [ '砸' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  tankuku_raisesign: {
    key: 'tankuku_raisesign',
    keywords: [ '唐可可举牌' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  capoo_say: {
    key: 'capoo_say',
    keywords: [ '咖波说' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 10,
      default_texts: [Array],
      args: []
    }
  },
  good_news: {
    key: 'good_news',
    keywords: [ '喜报' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  scroll: {
    key: 'scroll',
    keywords: [ '滚屏' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  suck: {
    key: 'suck',
    keywords: [ '吸', '嗦' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  kirby_hammer: {
    key: 'kirby_hammer',
    keywords: [ '卡比锤', '卡比重锤' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  douyin: {
    key: 'douyin',
    keywords: [ 'douyin' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  marriage: {
    key: 'marriage',
    keywords: [ '结婚申请', '结婚登记' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  pat: {
    key: 'pat',
    keywords: [ '拍' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  wave: {
    key: 'wave',
    keywords: [ '波纹' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  pass_the_buck: {
    key: 'pass_the_buck',
    keywords: [ '推锅', '甩锅' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  hold_tight: {
    key: 'hold_tight',
    keywords: [ '抱紧' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  pornhub: {
    key: 'pornhub',
    keywords: [ 'ph', 'pornhub' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 2,
      max_texts: 2,
      default_texts: [Array],
      args: []
    }
  },
  capoo_rub: {
    key: 'capoo_rub',
    keywords: [ '咖波蹭', '咖波贴' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  blood_pressure: {
    key: 'blood_pressure',
    keywords: [ '高血压' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  high_EQ: {
    key: 'high_EQ',
    keywords: [ '低情商xx高情商xx' ],
    patterns: [ '低情商[\\s:：]*(.+?)\\s+高情商[\\s:：]*(.+)' ],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 2,
      max_texts: 2,
      default_texts: [Array],
      args: []
    }
  },
  loading: {
    key: 'loading',
    keywords: [ '加载中' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  kaleidoscope: {
    key: 'kaleidoscope',
    keywords: [ '万花筒', '万花镜' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  scratchcard: {
    key: 'scratchcard',
    keywords: [ '刮刮乐' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  wooden_fish: {
    key: 'wooden_fish',
    keywords: [ '木鱼' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  walnut_zoom: {
    key: 'walnut_zoom',
    keywords: [ '胡桃放大' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  kiss: {
    key: 'kiss',
    keywords: [ '亲', '亲亲' ],
    patterns: [],
    params: {
      min_images: 2,
      max_images: 2,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  luxun_say: {
    key: 'luxun_say',
    keywords: [ '鲁迅说', '鲁迅说过' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  anti_kidnap: {
    key: 'anti_kidnap',
    keywords: [ '防诱拐' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  slap: {
    key: 'slap',
    keywords: [ '一巴掌' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  no_response: {
    key: 'no_response',
    keywords: [ '无响应' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  my_friend: {
    key: 'my_friend',
    keywords: [ '我朋友说' ],
    patterns: [ '我(?:有个)?朋友(?P<name>.*?)说' ],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 1,
      max_texts: 10,
      default_texts: [Array],
      args: [Array]
    }
  },
  repeat: {
    key: 'repeat',
    keywords: [ '复读' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 5,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  fencing: {
    key: 'fencing',
    keywords: [ '击剑', '🤺' ],
    patterns: [],
    params: {
      min_images: 2,
      max_images: 2,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  jiujiu: {
    key: 'jiujiu',
    keywords: [ '啾啾' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  jiji_king: {
    key: 'jiji_king',
    keywords: [ '急急国王' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 11,
      min_texts: 0,
      max_texts: 11,
      default_texts: [],
      args: [Array]
    }
  },
  love_you: {
    key: 'love_you',
    keywords: [ '永远爱你' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  interview: {
    key: 'interview',
    keywords: [ '采访' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 2,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  windmill_turn: {
    key: 'windmill_turn',
    keywords: [ '风车转' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  hold_grudge: {
    key: 'hold_grudge',
    keywords: [ '记仇' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  trance: {
    key: 'trance',
    keywords: [ '恍惚' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  dont_go_near: {
    key: 'dont_go_near',
    keywords: [ '不要靠近' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  little_angel: {
    key: 'little_angel',
    keywords: [ '小天使' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  safe_sense: {
    key: 'safe_sense',
    keywords: [ '安全感' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  call_110: {
    key: 'call_110',
    keywords: [ '遇到困难请拨打' ],
    patterns: [],
    params: {
      min_images: 2,
      max_images: 2,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  thump_wildly: {
    key: 'thump_wildly',
    keywords: [ '捶爆', '爆捶' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  applaud: {
    key: 'applaud',
    keywords: [ '鼓掌' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  find_chips: {
    key: 'find_chips',
    keywords: [ '整点薯条' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 4,
      max_texts: 4,
      default_texts: [Array],
      args: []
    }
  },
  always: {
    key: 'always',
    keywords: [ '一直' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  cyan: {
    key: 'cyan',
    keywords: [ '群青' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  punch: {
    key: 'punch',
    keywords: [ '打拳' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  name_generator: {
    key: 'name_generator',
    keywords: [ '亚文化取名机', '亚名' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  incivilization: {
    key: 'incivilization',
    keywords: [ '不文明' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  painter: {
    key: 'painter',
    keywords: [ '小画家' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  turn: {
    key: 'turn',
    keywords: [ '转' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  prpr: {
    key: 'prpr',
    keywords: [ '舔', '舔屏', 'prpr' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  twist: {
    key: 'twist',
    keywords: [ '搓' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  murmur: {
    key: 'murmur',
    keywords: [ '低语' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  rub: {
    key: 'rub',
    keywords: [ '贴', '贴贴', '蹭', '蹭蹭' ],
    patterns: [],
    params: {
      min_images: 2,
      max_images: 2,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  bubble_tea: {
    key: 'bubble_tea',
    keywords: [ '奶茶' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  step_on: {
    key: 'step_on',
    keywords: [ '踩' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  sit_still: {
    key: 'sit_still',
    keywords: [ '坐得住', '坐的住' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  throw: {
    key: 'throw',
    keywords: [ '丢', '扔' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  thump: {
    key: 'thump',
    keywords: [ '捶' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  ask: {
    key: 'ask',
    keywords: [ '问问' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  slogan: {
    key: 'slogan',
    keywords: [ '口号' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 6,
      max_texts: 6,
      default_texts: [Array],
      args: []
    }
  },
  potato: {
    key: 'potato',
    keywords: [ '土豆' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  note_for_leave: {
    key: 'note_for_leave',
    keywords: [ '请假条' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: [Array]
    }
  },
  cover_face: {
    key: 'cover_face',
    keywords: [ '捂脸' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  scratch_head: {
    key: 'scratch_head',
    keywords: [ '挠头' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  capoo_draw: {
    key: 'capoo_draw',
    keywords: [ '咖波画' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  play: {
    key: 'play',
    keywords: [ '顶', '玩' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  hutao_bite: {
    key: 'hutao_bite',
    keywords: [ '胡桃啃' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  look_this_icon: {
    key: 'look_this_icon',
    keywords: [ '看图标' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  bite: {
    key: 'bite',
    keywords: [ '啃' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  youtube: {
    key: 'youtube',
    keywords: [ 'yt', 'youtube' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 2,
      max_texts: 2,
      default_texts: [Array],
      args: []
    }
  },
  gun: {
    key: 'gun',
    keywords: [ '手枪' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  police: {
    key: 'police',
    keywords: [ '出警' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  police1: {
    key: 'police1',
    keywords: [ '警察' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  decent_kiss: {
    key: 'decent_kiss',
    keywords: [ '像样的亲亲' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  shutup: {
    key: 'shutup',
    keywords: [ '别说了' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  google: {
    key: 'google',
    keywords: [ 'google' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  throw_gif: {
    key: 'throw_gif',
    keywords: [ '抛', '掷' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  raise_sign: {
    key: 'raise_sign',
    keywords: [ '举牌' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  worship: {
    key: 'worship',
    keywords: [ '膜', '膜拜' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  captain: {
    key: 'captain',
    keywords: [ '舰长' ],
    patterns: [],
    params: {
      min_images: 2,
      max_images: 5,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  bad_news: {
    key: 'bad_news',
    keywords: [ '悲报' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  divorce: {
    key: 'divorce',
    keywords: [ '离婚协议', '离婚申请' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  back_to_work: {
    key: 'back_to_work',
    keywords: [ '继续干活', '打工人' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  kick_ball: {
    key: 'kick_ball',
    keywords: [ '踢球' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  hammer: {
    key: 'hammer',
    keywords: [ '锤' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  knock: {
    key: 'knock',
    keywords: [ '敲' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  learn: {
    key: 'learn',
    keywords: [ '偷学' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  '5000choyen': {
    key: '5000choyen',
    keywords: [ '5000兆' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 2,
      max_texts: 2,
      default_texts: [Array],
      args: []
    }
  },
  petpet: {
    key: 'petpet',
    keywords: [ '摸', '摸摸', '摸头', 'rua' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: [Array]
    }
  },
  ascension: {
    key: 'ascension',
    keywords: [ '升天' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  karyl_point: {
    key: 'karyl_point',
    keywords: [ '凯露指' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  wallpaper: {
    key: 'wallpaper',
    keywords: [ '墙纸' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  eat: {
    key: 'eat',
    keywords: [ '吃' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  play_game: {
    key: 'play_game',
    keywords: [ '玩游戏' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  capoo_rip: {
    key: 'capoo_rip',
    keywords: [ '咖波撕' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  perfect: {
    key: 'perfect',
    keywords: [ '完美' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  funny_mirror: {
    key: 'funny_mirror',
    keywords: [ '哈哈镜' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  distracted: {
    key: 'distracted',
    keywords: [ '注意力涣散' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  make_friend: {
    key: 'make_friend',
    keywords: [ '交个朋友' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  wujing: {
    key: 'wujing',
    keywords: [ '吴京xx中国xx' ],
    patterns: [ '吴京[\\s:：]*(.*?)中国(.*)' ],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 2,
      max_texts: 2,
      default_texts: [Array],
      args: []
    }
  },
  together: {
    key: 'together',
    keywords: [ '一起' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  paint: {
    key: 'paint',
    keywords: [ '这像画吗' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  why_at_me: {
    key: 'why_at_me',
    keywords: [ '为什么@我' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  dog_of_vtb: {
    key: 'dog_of_vtb',
    keywords: [ '管人痴' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  think_what: {
    key: 'think_what',
    keywords: [ '想什么' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  fanatic: {
    key: 'fanatic',
    keywords: [ '狂爱', '狂粉' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  support: {
    key: 'support',
    keywords: [ '精神支柱' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  meteor: {
    key: 'meteor',
    keywords: [ '流星' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  keep_away: {
    key: 'keep_away',
    keywords: [ '远离' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 8,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  anya_suki: {
    key: 'anya_suki',
    keywords: [ '阿尼亚喜欢' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  need: {
    key: 'need',
    keywords: [ '需要', '你可能需要' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  printing: {
    key: 'printing',
    keywords: [ '打印' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  dinosaur: {
    key: 'dinosaur',
    keywords: [ '恐龙', '小恐龙' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  follow: {
    key: 'follow',
    keywords: [ '关注' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  imprison: {
    key: 'imprison',
    keywords: [ '坐牢' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  dianzhongdian: {
    key: 'dianzhongdian',
    keywords: [ '入典', '典中典', '黑白草图' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 1,
      max_texts: 2,
      default_texts: [Array],
      args: []
    }
  },
  psyduck: {
    key: 'psyduck',
    keywords: [ '可达鸭' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 2,
      max_texts: 2,
      default_texts: [Array],
      args: []
    }
  },
  always_like: {
    key: 'always_like',
    keywords: [ '我永远喜欢' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 6,
      min_texts: 0,
      max_texts: 6,
      default_texts: [],
      args: []
    }
  },
  wakeup: {
    key: 'wakeup',
    keywords: [ 'xx起来了' ],
    patterns: [ '(.+?)\\s+起来了' ],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  pound: {
    key: 'pound',
    keywords: [ '捣' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  nekoha_holdsign: {
    key: 'nekoha_holdsign',
    keywords: [ '猫羽雫举牌', '猫猫举牌' ],
    patterns: [],
    params: {
      min_images: 0,
      max_images: 0,
      min_texts: 1,
      max_texts: 1,
      default_texts: [Array],
      args: []
    }
  },
  can_can_need: {
    key: 'can_can_need',
    keywords: [ '看看你的' ],
    patterns: [],
    params: {
      min_images: 2,
      max_images: 2,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  do: {
    key: 'do',
    keywords: [ '撅', '狠狠地撅' ],
    patterns: [],
    params: {
      min_images: 2,
      max_images: 2,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  empathy: {
    key: 'empathy',
    keywords: [ '换位思考' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  fleshlight: {
    key: 'fleshlight',
    keywords: [ '飞机杯' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  forbid: {
    key: 'forbid',
    keywords: [ '禁止', '禁' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  grab: {
    key: 'grab',
    keywords: [ '抓' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  looklook: {
    key: 'looklook',
    keywords: [ '瞧瞧你那样' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  },
  operator_generator: {
    key: 'operator_generator',
    keywords: [ '合成大干员' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 1,
      default_texts: [],
      args: []
    }
  },
  stretch: {
    key: 'stretch',
    keywords: [ '双手', '伸展' ],
    patterns: [],
    params: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      default_texts: [],
      args: []
    }
  }
}


function mkdirs (dirname) {
  if (fs.existsSync(dirname)) {
    return true
  } else {
    if (mkdirs(path.dirname(dirname))) {
      fs.mkdirSync(dirname)
      return true
    }
  }
}

async function getMasterQQ () {
  return (await import('../../lib/config/config.js')).default.masterQQ
}
