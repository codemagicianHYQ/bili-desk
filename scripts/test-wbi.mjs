import axios from 'axios'

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com',
  Origin: 'https://www.bilibili.com'
}

async function test(label, cookie) {
  const res = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
    headers: cookie ? { ...headers, Cookie: cookie } : headers,
    validateStatus: () => true
  })
  console.log(label, {
    status: res.status,
    code: res.data?.code,
    hasWbi: Boolean(res.data?.data?.wbi_img?.img_url),
    isLogin: res.data?.data?.isLogin,
    message: res.data?.message
  })
}

await test('no cookie')
await test('buvid3 only', 'buvid3=FB028AEB-DDA8-BD9A-EE78-F6790DC5284044842infoc')
await test('bad sess', 'SESSDATA=deadbeef; buvid3=FB028AEB')
