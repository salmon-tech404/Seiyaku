import { type Address, getAddress } from 'viem';

export const XLAYER_CHAIN_ID = 196 as const;

export const XLAYER_ADDRESSES = {
  usdc: getAddress('0xB6CEceAB302E2E4948951eE7843FC24E92933061'),
  wokb: getAddress('0xe538905cf8410324e03a5a23c1c177a474d59b2b'),
  uniswapV3Factory: getAddress('0x4B2ab38DBF28D31D467aA8993f6c2585981D6804'),
  swapRouter02: getAddress('0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA'),
  quoterV2: getAddress('0xD1b797D92d87B688193A2B976eFc8D577D204343'),
  tapeoutProcessorFactory: getAddress('0x1f09DAeFA827f02CBb40967cc91b259763760761'),
  poolUsdcWokb500: getAddress('0x9f73888Fb725A3409548BC8d2e42365AC063E148'),
} as const satisfies Record<string, Address>;

export type XLayerAddressKey = keyof typeof XLAYER_ADDRESSES;
