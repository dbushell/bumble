import {MurmurHash3} from './deps.ts';

export const encodeHash = (value: string) =>
  new MurmurHash3(value).result().toString(16);
