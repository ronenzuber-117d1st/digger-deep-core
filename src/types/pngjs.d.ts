declare module 'pngjs' {
  interface PNGOptions {
    width?: number;
    height?: number;
    filterType?: number;
  }
  interface PNGData {
    width: number;
    height: number;
    data: Buffer;
  }
  class PNG {
    constructor(options?: PNGOptions);
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNGData;
      write(png: PNG): Buffer;
    };
  }
  export { PNG };
}
