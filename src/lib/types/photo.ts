export type PhotoVariants = {
  original: string;
  profile_128?: string;
  profile_256?: string;
  profile_512?: string;
  profile_768?: string;
  gallery_512?: string;
  gallery_1024?: string;
  gallery_1600?: string;
};

export type PhotoUrls = {
  original: string;
  profile_128: string | null;
  profile_256: string | null;
  profile_512: string | null;
  profile_768: string | null;
  gallery_512: string | null;
  gallery_1024: string | null;
  gallery_1600: string | null;
};
