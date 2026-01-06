/**
 * Simple ZIP Archive Builder
 *
 * Creates ZIP archives using Node.js built-in modules.
 * This is a minimal implementation for ESX export.
 *
 * ZIP Format (simplified):
 * - Local file headers
 * - File data (with deflate compression optional)
 * - Central directory
 * - End of central directory
 */

import { deflateRawSync } from 'zlib';

interface ZipEntry {
  name: string;
  data: Buffer;
  date: Date;
  compressed?: boolean;
}

/**
 * Build a ZIP archive from entries
 */
export function buildZipArchive(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;

  // Process each entry
  for (const entry of entries) {
    const encodedName = Buffer.from(entry.name, 'utf8');

    // Optionally compress the data
    let compressedData = entry.data;
    let compressionMethod = 0; // 0 = stored (no compression)

    if (entry.compressed !== false && entry.data.length > 100) {
      try {
        const deflated = deflateRawSync(entry.data, { level: 6 });
        if (deflated.length < entry.data.length) {
          compressedData = deflated;
          compressionMethod = 8; // 8 = deflate
        }
      } catch {
        // Fall back to stored if compression fails
      }
    }

    // Build local file header
    const localHeader = buildLocalFileHeader(
      encodedName,
      entry.data.length,
      compressedData.length,
      compressionMethod,
      crc32(entry.data),
      dateToDosDateTime(entry.date)
    );

    // Build central directory entry
    const centralEntry = buildCentralDirectoryEntry(
      encodedName,
      entry.data.length,
      compressedData.length,
      compressionMethod,
      crc32(entry.data),
      dateToDosDateTime(entry.date),
      offset
    );

    localHeaders.push(localHeader);
    localHeaders.push(compressedData);
    centralDirectory.push(centralEntry);

    offset += localHeader.length + compressedData.length;
  }

  // Build end of central directory
  const centralDirectoryBuffer = Buffer.concat(centralDirectory);
  const centralDirectoryOffset = offset;
  const endOfCentralDirectory = buildEndOfCentralDirectory(
    entries.length,
    centralDirectoryBuffer.length,
    centralDirectoryOffset
  );

  // Combine all parts
  return Buffer.concat([
    ...localHeaders,
    centralDirectoryBuffer,
    endOfCentralDirectory,
  ]);
}

/**
 * Build local file header
 */
function buildLocalFileHeader(
  name: Buffer,
  uncompressedSize: number,
  compressedSize: number,
  compressionMethod: number,
  crc: number,
  dosDateTime: { date: number; time: number }
): Buffer {
  const header = Buffer.alloc(30 + name.length);
  let offset = 0;

  // Signature: PK\x03\x04
  header.writeUInt32LE(0x04034b50, offset);
  offset += 4;

  // Version needed to extract (2.0)
  header.writeUInt16LE(20, offset);
  offset += 2;

  // General purpose bit flag
  header.writeUInt16LE(0, offset);
  offset += 2;

  // Compression method
  header.writeUInt16LE(compressionMethod, offset);
  offset += 2;

  // Last mod file time
  header.writeUInt16LE(dosDateTime.time, offset);
  offset += 2;

  // Last mod file date
  header.writeUInt16LE(dosDateTime.date, offset);
  offset += 2;

  // CRC-32
  header.writeUInt32LE(crc, offset);
  offset += 4;

  // Compressed size
  header.writeUInt32LE(compressedSize, offset);
  offset += 4;

  // Uncompressed size
  header.writeUInt32LE(uncompressedSize, offset);
  offset += 4;

  // File name length
  header.writeUInt16LE(name.length, offset);
  offset += 2;

  // Extra field length
  header.writeUInt16LE(0, offset);
  offset += 2;

  // File name
  name.copy(header, offset);

  return header;
}

/**
 * Build central directory file header
 */
function buildCentralDirectoryEntry(
  name: Buffer,
  uncompressedSize: number,
  compressedSize: number,
  compressionMethod: number,
  crc: number,
  dosDateTime: { date: number; time: number },
  localHeaderOffset: number
): Buffer {
  const entry = Buffer.alloc(46 + name.length);
  let offset = 0;

  // Signature: PK\x01\x02
  entry.writeUInt32LE(0x02014b50, offset);
  offset += 4;

  // Version made by (2.0, Unix)
  entry.writeUInt16LE(0x0314, offset);
  offset += 2;

  // Version needed to extract (2.0)
  entry.writeUInt16LE(20, offset);
  offset += 2;

  // General purpose bit flag
  entry.writeUInt16LE(0, offset);
  offset += 2;

  // Compression method
  entry.writeUInt16LE(compressionMethod, offset);
  offset += 2;

  // Last mod file time
  entry.writeUInt16LE(dosDateTime.time, offset);
  offset += 2;

  // Last mod file date
  entry.writeUInt16LE(dosDateTime.date, offset);
  offset += 2;

  // CRC-32
  entry.writeUInt32LE(crc, offset);
  offset += 4;

  // Compressed size
  entry.writeUInt32LE(compressedSize, offset);
  offset += 4;

  // Uncompressed size
  entry.writeUInt32LE(uncompressedSize, offset);
  offset += 4;

  // File name length
  entry.writeUInt16LE(name.length, offset);
  offset += 2;

  // Extra field length
  entry.writeUInt16LE(0, offset);
  offset += 2;

  // File comment length
  entry.writeUInt16LE(0, offset);
  offset += 2;

  // Disk number start
  entry.writeUInt16LE(0, offset);
  offset += 2;

  // Internal file attributes
  entry.writeUInt16LE(0, offset);
  offset += 2;

  // External file attributes
  entry.writeUInt32LE(0, offset);
  offset += 4;

  // Relative offset of local header
  entry.writeUInt32LE(localHeaderOffset, offset);
  offset += 4;

  // File name
  name.copy(entry, offset);

  return entry;
}

/**
 * Build end of central directory record
 */
function buildEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
): Buffer {
  const record = Buffer.alloc(22);
  let offset = 0;

  // Signature: PK\x05\x06
  record.writeUInt32LE(0x06054b50, offset);
  offset += 4;

  // Number of this disk
  record.writeUInt16LE(0, offset);
  offset += 2;

  // Disk where central directory starts
  record.writeUInt16LE(0, offset);
  offset += 2;

  // Number of central directory records on this disk
  record.writeUInt16LE(entryCount, offset);
  offset += 2;

  // Total number of central directory records
  record.writeUInt16LE(entryCount, offset);
  offset += 2;

  // Size of central directory
  record.writeUInt32LE(centralDirectorySize, offset);
  offset += 4;

  // Offset of start of central directory
  record.writeUInt32LE(centralDirectoryOffset, offset);
  offset += 4;

  // Comment length
  record.writeUInt16LE(0, offset);

  return record;
}

/**
 * Convert Date to DOS date/time format
 */
function dateToDosDateTime(date: Date): { date: number; time: number } {
  const year = date.getFullYear() - 1980;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    date: (year << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

/**
 * Calculate CRC-32 checksum
 */
function crc32(data: Buffer): number {
  // CRC-32 lookup table
  const table = makeCrcTable();

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Generate CRC-32 lookup table
 */
function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
}
