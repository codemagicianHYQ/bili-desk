/** 浏览器和 Node 都能用的 MD5。WBI 签名依赖它，结果必须和 Node crypto 一致。 */
export function md5(input) {
    const bytes = new TextEncoder().encode(input);
    const words = new Uint32Array((((bytes.length + 8) >>> 6) + 1) * 16);
    for (let i = 0; i < bytes.length; i += 1) {
        words[i >> 2] |= bytes[i] << ((i % 4) * 8);
    }
    words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
    const bitLen = bytes.length * 8;
    words[words.length - 2] = bitLen >>> 0;
    words[words.length - 1] = Math.floor(bitLen / 0x100000000);
    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;
    const f = (x, y, z) => (x & y) | (~x & z);
    const g = (x, y, z) => (x & z) | (y & ~z);
    const h = (x, y, z) => x ^ y ^ z;
    const iFn = (x, y, z) => y ^ (x | ~z);
    const rot = (x, n) => (x << n) | (x >>> (32 - n));
    const rounds = [
        [f, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [7, 12, 17, 22]],
        [g, [1, 6, 11, 0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12], [5, 9, 14, 20]],
        [h, [5, 8, 11, 14, 1, 4, 7, 10, 13, 0, 3, 6, 9, 12, 15, 2], [4, 11, 16, 23]],
        [iFn, [0, 7, 14, 5, 12, 3, 10, 1, 8, 15, 6, 13, 4, 11, 2, 9], [6, 10, 15, 21]],
    ];
    const sine = rounds.map((_, round) => Array.from({ length: 16 }, (__, step) => Math.floor(Math.abs(Math.sin(round * 16 + step + 1)) * 0x100000000)));
    for (let offset = 0; offset < words.length; offset += 16) {
        let aa = a;
        let bb = b;
        let cc = c;
        let dd = d;
        for (let round = 0; round < 4; round += 1) {
            const [fn, index, shift] = rounds[round];
            for (let step = 0; step < 16; step += 1) {
                const next = (aa + fn(bb, cc, dd) + words[offset + index[step]] + sine[round][step]) >>> 0;
                aa = dd;
                dd = cc;
                cc = bb;
                bb = (bb + rot(next, shift[step % 4])) >>> 0;
            }
        }
        a = (a + aa) >>> 0;
        b = (b + bb) >>> 0;
        c = (c + cc) >>> 0;
        d = (d + dd) >>> 0;
    }
    const out = [a, b, c, d];
    return out
        .map((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""))
        .join("");
}
