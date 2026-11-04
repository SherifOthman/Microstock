export type SupportedPlatform =
  | 'adobe'
  | 'freepik'
  | 'shutterstock'
  | 'vecteezy'
  | 'dreamstime'
  | '123rf';

export interface ExportPlatformConfig {
  id: SupportedPlatform;
  name: string;
  filenameSuffix: string;
  delimiter: string;
}

export const PLATFORMS_CONFIG: Record<SupportedPlatform, ExportPlatformConfig> = {
  adobe: {
    id: 'adobe',
    name: 'Adobe Stock',
    filenameSuffix: 'adobe_stock.csv',
    delimiter: ',',
  },
  freepik: {
    id: 'freepik',
    name: 'Magnific',
    filenameSuffix: 'magnific.csv',
    delimiter: ';', // Magnific (Freepik) standard semicolon
  },
  shutterstock: {
    id: 'shutterstock',
    name: 'Shutterstock',
    filenameSuffix: 'shutterstock.csv',
    delimiter: ',',
  },
  vecteezy: {
    id: 'vecteezy',
    name: 'Vecteezy',
    filenameSuffix: 'vecteezy.csv',
    delimiter: ',',
  },
  dreamstime: {
    id: 'dreamstime',
    name: 'Dreamstime',
    filenameSuffix: 'dreamstime.csv',
    delimiter: ',',
  },
  '123rf': {
    id: '123rf',
    name: '123RF',
    filenameSuffix: '123rf.csv',
    delimiter: ',',
  },
};
