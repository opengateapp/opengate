// Folder layouts, copied from the Project Folders tool (opengateapp/projectfolders, presets/*.txt).
// default.txt is General Video here. Kept in step by hand for now.

export interface FolderLayout { id: string; label: string; folders: string[]; /** Where Open Gate's paperwork goes. */ documents: string }

export const LAYOUTS: FolderLayout[] = [
  {
    id: 'general',
    label: 'General Video',
    documents: '06_DOCUMENTS',
    folders: [
      '00_MEDIA/CAMERA', '00_MEDIA/AUDIO/PRODUCTION', '00_MEDIA/AUDIO/VO', '00_MEDIA/AUDIO/FOLEY', '00_MEDIA/AUDIO/SFX', '00_MEDIA/AUDIO/MUSIC', '00_MEDIA/PHOTOS', '00_MEDIA/GRAPHICS', '00_MEDIA/STOCK',
      '01_PROXY',
      '02_PROJECT_FILES/EDIT', '02_PROJECT_FILES/COLOR', '02_PROJECT_FILES/MOTION', '02_PROJECT_FILES/SOUND',
      '03_VFX', '04_RENDERS', '05_OUTPUT/REVIEW', '05_OUTPUT/FINAL',
      '06_DOCUMENTS/SCRIPTS', '06_DOCUMENTS/SHOT_LISTS', '06_DOCUMENTS/RELEASES_AND_CONTRACTS', '06_DOCUMENTS/REFERENCE',
    ],
  },
  {
    id: 'resolve-cloud-team',
    label: 'Resolve Cloud Team',
    documents: '06_DOCUMENTS',
    folders: [
      '00_MEDIA/CAMERA', '00_MEDIA/AUDIO/PRODUCTION', '00_MEDIA/AUDIO/FOLEY', '00_MEDIA/AUDIO/MUSIC', '00_MEDIA/PHOTOS', '00_MEDIA/GRAPHICS/POSTER',
      '01_PROXY', '02_PROJECT_FILES/DAVINCI', '02_PROJECT_FILES/PREMIERE', '03_VFX', '04_RENDERS', '05_OUTPUT', '06_DOCUMENTS',
    ],
  },
  {
    id: 'classic',
    label: 'Classic',
    documents: 'DOCUMENTS',
    folders: ['VIDEO/OUTPUT', 'AUDIO/FOLEY', 'AUDIO/MUSIC', 'GRAPHICS/POSTER', 'PHOTOS', 'TIMELINES/DAVINCI', 'TIMELINES/PREMIERE', 'DOCUMENTS'],
  },
];
export const DEFAULT_LAYOUT = LAYOUTS[0];
export const layoutById = (id: string | null | undefined) => LAYOUTS.find((l) => l.id === id) ?? DEFAULT_LAYOUT;

/** The same folders go inside every layout's documents folder. */
export const DOCUMENT_FOLDERS = ['SCRIPTS/DRAFTS', 'TREATMENTS_AND_NOTES', 'CHARACTERS', 'STORYBOARDS', 'SHOT_LISTS', 'BREAKDOWN', 'SCHEDULE', 'CALL_SHEETS', 'CONTACTS', 'LOCATIONS', 'BUDGET', 'RELEASES_AND_CONTRACTS', 'REFERENCE', 'RELEASE'];

/** The folders at the top of a layout, in order (for the short preview). */
export const topFolders = (l: FolderLayout) => [...new Set(l.folders.map((f) => f.split('/')[0]))];
