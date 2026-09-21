import type { Writable } from 'stream';

/**
 * A stand-in for `archiver`, which ships as ESM only and cannot be loaded by
 * ts-jest. It is mapped in `jest-integration.json`.
 *
 * It writes a genuine ZIP file rather than a placeholder — stored entries, no
 * compression — so a test can open what the code under test produced and check
 * that the entries and their contents are what was appended. A stub that
 * emitted an opaque blob would let an export bug pass unnoticed, which is
 * exactly the failure the finance package suites exist to catch.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  content: Buffer;
  crc: number;
  offset: number;
}

type ErrorListener = (error: Error) => void;

class ZipArchive {
  private readonly listeners: ErrorListener[] = [];
  private readonly entries: Entry[] = [];
  private readonly parts: Buffer[] = [];
  private offset = 0;
  private destination: Writable | null = null;

  /** `archiver` takes { zlib: { level } }; stored entries ignore it. */
  constructor(_options?: unknown) {}

  /** Only 'error' is listened for by the code under test. */
  on(event: 'error', listener: ErrorListener): this {
    if (event === 'error') this.listeners.push(listener);
    return this;
  }

  private fail(error: Error): void {
    for (const listener of this.listeners) listener(error);
  }

  append(content: Buffer | string, options: { name: string }): this {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const name = Buffer.from(options.name, 'utf8');
    const crc = crc32(buffer);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // local file header
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // stored
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0, 12); // date
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(buffer.length, 18);
    header.writeUInt32LE(buffer.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28); // extra length

    this.entries.push({
      name: options.name,
      content: buffer,
      crc,
      offset: this.offset,
    });
    for (const part of [header, name, buffer]) {
      this.parts.push(part);
      this.offset += part.length;
    }
    return this;
  }

  pipe(destination: Writable): Writable {
    this.destination = destination;
    return destination;
  }

  async finalize(): Promise<void> {
    const directory: Buffer[] = [];
    let directorySize = 0;

    for (const entry of this.entries) {
      const name = Buffer.from(entry.name, 'utf8');
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0); // central directory header
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(0, 8);
      record.writeUInt16LE(0, 10); // stored
      record.writeUInt16LE(0, 12);
      record.writeUInt16LE(0, 14);
      record.writeUInt32LE(entry.crc, 16);
      record.writeUInt32LE(entry.content.length, 20);
      record.writeUInt32LE(entry.content.length, 24);
      record.writeUInt16LE(name.length, 28);
      record.writeUInt32LE(entry.offset, 42);
      directory.push(record, name);
      directorySize += record.length + name.length;
    }

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // end of central directory
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(directorySize, 12);
    end.writeUInt32LE(this.offset, 16);

    const payload = Buffer.concat([...this.parts, ...directory, end]);
    const destination = this.destination;
    if (!destination) {
      this.fail(new Error('archive was finalized without a pipe'));
      return;
    }
    destination.write(payload);
    destination.end();
  }
}

interface ArchiverStub {
  (format: string, options?: unknown): ZipArchive;
  ZipArchive: typeof ZipArchive;
}

const archiver = ((format: string, options?: unknown) =>
  new ZipArchive(options)) as ArchiverStub;
archiver.ZipArchive = ZipArchive;

export = archiver;
