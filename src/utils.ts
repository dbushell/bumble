import {hex} from './deps.ts';
import Script from './script.ts';
import type {SerializedScript} from './script.ts';

export const hash = async (value: string, algorithm = 'SHA-256') =>
  new Uint8Array(
    await crypto.subtle.digest(algorithm, new TextEncoder().encode(value))
  );

export const encodeHash = async (value: string, algorithm?: string) =>
  hex.encodeHex(await hash(value, algorithm));

interface SerializedType<P> {
  type: string;
  serialized: P;
}

const replacer = (_key: string, value: unknown) => {
  if (value instanceof Map) {
    return {
      type: 'Map',
      serialized: Array.from(value.entries())
    };
  }
  if (value instanceof Script) {
    return {
      type: 'Script',
      serialized: value.serialize()
    };
  }
  return value;
};

const reviver = (_key: string, value: unknown) => {
  if (value && typeof value === 'object') {
    if ((value as SerializedType<unknown>).type === 'Map') {
      return new Map(
        (value as SerializedType<Map<unknown, unknown>>).serialized
      );
    }
    if ((value as SerializedType<unknown>).type === 'Script') {
      return Script.deserialize(
        (value as SerializedType<SerializedScript>).serialized
      );
    }
  }
  return value;
};

export const serialize = (value: unknown) => {
  return JSON.stringify(value, replacer, 2);
};

export const deserialize = (value: string) => {
  return JSON.parse(value, reviver);
};
