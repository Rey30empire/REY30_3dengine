export type PresetQualityTier = 'starter' | 'standard' | 'hero';

export interface PresetRegistryEntry<
  TCategory extends string,
  TParams,
  TId extends string = string,
> {
  id: TId;
  name: string;
  category: TCategory;
  tags: string[];
  thumbnail: string;
  qualityTier: PresetQualityTier;
  params: TParams;
}
