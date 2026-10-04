const fs = require('fs');
const path = require('path');

// Minimal USTAR writer: a tar is just 512-byte headers followed by NUL-padded bodies. Adding a
// dependency for that on a host where native builds are blocked is not worth it.
// `entries` are [nameInArchive, absolutePath] pairs.
function tarEntries(entries) {
  const parts = [];
  const padTo512 = (buf) => (buf.length % 512 ? Buffer.concat([buf, Buffer.alloc(512 - (buf.length % 512))]) : buf);
  for (const [name, file] of entries) {
    const body = fs.readFileSync(file);
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 99), 0, 'utf8');                                              // name
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);    // mode, uid, gid
    h.write(body.length.toString(8).padStart(11, '0') + '\0', 124);                      // size, octal
    h.write(Math.floor(fs.statSync(file).mtimeMs / 1000).toString(8).padStart(11, '0') + '\0', 136);
    h.write('        ', 148);                                                            // checksum: spaces while summing
    h.write('0', 156);                                                                   // typeflag: regular file
    h.write('ustar\0', 257); h.write('00', 263);                                         // magic + version
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);                              // real checksum
    parts.push(h, padTo512(body));
  }
  parts.push(Buffer.alloc(1024)); // two zero blocks terminate the archive
  return Buffer.concat(parts);
}
const tarFiles = (dir, names) => tarEntries(names.map((n) => [n, path.join(dir, n)]));

module.exports = { tarEntries, tarFiles };
