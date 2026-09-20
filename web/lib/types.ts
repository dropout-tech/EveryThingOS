export type ErpModules = {
  inventory: boolean;
  manufacturing: boolean;
  pos: boolean;
  projects: boolean;
  batch: boolean;
};

export type IndustryModules = {
  crm: boolean;
  erp: ErpModules;
  funnel: boolean;
  hygiene: boolean;
  website: boolean;
  line: boolean;
};

export type IndustryPack = {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  group: string;
  itemType: string;
  fulfillment: string;
  tagline: string;
  pains: string[];
  kpis: string[];
  workflow: { id: string; name: string; stages: string[] };
  saasReplaced: string[];
  modules: IndustryModules;
  sampleLoop: string;
};
