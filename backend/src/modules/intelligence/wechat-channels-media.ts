export const CHANNELS_DECRYPT_UNSPECIFIED = 'CHANNELS_DECRYPT_UNSPECIFIED';

/** A verified encrypted prefix, key and expected plaintext are required before recognition. */
export function decryptWechatChannelsMedia(_bytes: Uint8Array, _decodeKey: string): Uint8Array {
  throw Object.assign(new Error(CHANNELS_DECRYPT_UNSPECIFIED), { code: CHANNELS_DECRYPT_UNSPECIFIED });
}
