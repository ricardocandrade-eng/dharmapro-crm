// ══════════════════════════════════════════════════════════════════════════════
//  build-crx.mjs — empacota e assina a extensão DharmaPro Connector como CRX3
//
//  Node puro (sem dependências). Reusa a chave .keys/dharma_ext_key.pem, então o
//  ID resultante é SEMPRE olchhnpoahdnojbddelggipmclaefelk (bate com o manifest
//  key + a força-instalação). Gera:
//    extensao-forcar-instalacao/dharmapro-connector.bin  (CRX3 assinado)
//
//  Uso:  node extensao-forcar-instalacao/build-crx.mjs
//  Depois: subir o .bin + update.xml no Worker Cloudflare lingering-flower-c902.
//
//  Referências de formato:
//   - CRX3: 'Cr24' + u32(3) + u32(headerLen) + CrxFileHeader(protobuf) + zip
//   - Assinatura RSA-SHA256 sobre:
//       "CRX3 SignedData\0" + u32LE(len(signedHeaderData)) + signedHeaderData + zip
//   - crx_id = SHA256(SPKI-DER da chave pública)[:16]
// ══════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createPrivateKey, createPublicKey, createHash, sign as cryptoSign } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO      = resolve(__dirname, '..');
const EXT_DIR   = join(REPO, 'extensao-dharmapro');
const KEY_PATH  = join(EXT_DIR, '.keys', 'dharma_ext_key.pem');
const OUT_PATH  = join(__dirname, 'dharmapro-connector.bin');
const EXPECTED_ID = 'olchhnpoahdnojbddelggipmclaefelk';

// Arquivos de runtime que entram no pacote (exclui .keys/, fixtures/, test-ping.html).
const FILES = [
  'manifest.json',
  'background.js',
  'content-adapter.js',
  'content-bridge.js',
  'content-ng-loader.js',
  'content-ng.js',
  'content-ping.js',
  'content-verohub.js',
  'content-viabilidade-bridge.js',
  'ping-main-world.js',
  'verohub-main-world.js'
];

// ── CRC32 (tabela) ─────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── ZIP writer mínimo (deflate) ─────────────────────────────────────────────────
function buildZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const comp = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);   // local file header sig
    lh.writeUInt16LE(20, 4);           // version needed
    lh.writeUInt16LE(0, 6);            // flags
    lh.writeUInt16LE(8, 8);            // method = deflate
    lh.writeUInt16LE(0, 10);           // mod time
    lh.writeUInt16LE(0x21, 12);        // mod date (fixo)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);           // extra len
    locals.push(lh, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);   // central dir sig
    cd.writeUInt16LE(20, 4);           // version made by
    cd.writeUInt16LE(20, 6);           // version needed
    cd.writeUInt16LE(0, 8);            // flags
    cd.writeUInt16LE(8, 10);           // method
    cd.writeUInt16LE(0, 12);           // mod time
    cd.writeUInt16LE(0x21, 14);        // mod date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);           // extra
    cd.writeUInt16LE(0, 32);           // comment
    cd.writeUInt16LE(0, 34);           // disk
    cd.writeUInt16LE(0, 36);           // internal attrs
    cd.writeUInt32LE(0, 38);           // external attrs
    cd.writeUInt32LE(offset, 42);      // local header offset
    central.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }
  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localPart, centralPart, eocd]);
}

// ── protobuf helpers ────────────────────────────────────────────────────────────
function varint(n) {
  const out = [];
  while (n > 127) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
  return Buffer.from(out);
}
function pbBytes(field, buf) {
  const tag = varint((field << 3) | 2);
  return Buffer.concat([tag, varint(buf.length), buf]);
}

// ── main ─────────────────────────────────────────────────────────────────────────
const pem = readFileSync(KEY_PATH, 'utf8');
const privKey = createPrivateKey(pem);
const pubKey  = createPublicKey(privKey);
const spki    = pubKey.export({ type: 'spki', format: 'der' });

// ID a partir do SPKI
const crxId = createHash('sha256').update(spki).digest().subarray(0, 16);
const id = Array.from(crxId).map(b => {
  const hi = 'a'.charCodeAt(0) + (b >> 4);
  const lo = 'a'.charCodeAt(0) + (b & 0x0f);
  return String.fromCharCode(hi) + String.fromCharCode(lo);
}).join('');

if (id !== EXPECTED_ID) {
  console.error('❌ ID gerado (' + id + ') != esperado (' + EXPECTED_ID + '). Chave errada — ABORTANDO.');
  process.exit(1);
}

// zip dos arquivos de runtime
const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf8'));
const entries = FILES.map(name => ({ name, data: readFileSync(join(EXT_DIR, name)) }));
const zip = buildZip(entries);

// SignedData { crx_id (field 1) }
const signedHeaderData = pbBytes(1, crxId);

// assinatura RSA-SHA256
const magic = Buffer.from('CRX3 SignedData\0', 'binary'); // 16 bytes
const lenLE = Buffer.alloc(4); lenLE.writeUInt32LE(signedHeaderData.length, 0);
const signInput = Buffer.concat([magic, lenLE, signedHeaderData, zip]);
const signature = cryptoSign('RSA-SHA256', signInput, privKey);

// AsymmetricKeyProof { public_key (1), signature (2) }
const proof = Buffer.concat([pbBytes(1, spki), pbBytes(2, signature)]);
// CrxFileHeader { sha256_with_rsa (2) repeated, signed_header_data (10000) }
const header = Buffer.concat([pbBytes(2, proof), pbBytes(10000, signedHeaderData)]);

const fileMagic = Buffer.from('Cr24', 'binary');
const ver = Buffer.alloc(4); ver.writeUInt32LE(3, 0);
const hlen = Buffer.alloc(4); hlen.writeUInt32LE(header.length, 0);
const crx = Buffer.concat([fileMagic, ver, hlen, header, zip]);

writeFileSync(OUT_PATH, crx);

console.log('✅ CRX3 gerado:');
console.log('   arquivo:  ' + OUT_PATH + ' (' + statSync(OUT_PATH).size + ' bytes)');
console.log('   versão:   ' + manifest.version);
console.log('   ID:       ' + id + '  (confere)');
console.log('   magia:    ' + crx.subarray(0, 4).toString('binary') + '  ' + [...crx.subarray(0,4)].map(b=>b.toString(16)).join(' '));
console.log('   arquivos: ' + entries.length + ' (' + FILES.join(', ') + ')');
