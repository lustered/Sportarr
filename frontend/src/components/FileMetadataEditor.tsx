import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import apiClient from '../api/client';

/**
 * Shared editor component for EventFile metadata. Used in four places with
 * identical look and behavior:
 *   1. Post-import per-row pencil edit (Files panel)
 *   2. ManualImportModal pre-import editing
 *   3. LibraryImportPage pre-import editing
 *   4. ActivityPage PendingImport pre-import editing
 *
 * "Controlled" component: parent owns the values via `value` and `onChange`.
 * The parent decides whether/when to PUT to the backend (post-import flow) or
 * pass values through to the import endpoint (pre-import flow). This is what
 * keeps the same component reusable across all four hosts.
 *
 * Field set mirrors Sonarr's bulk file editor (Quality, ReleaseGroup, Languages,
 * IndexerFlags, plus Sportarr's Codec/Source/PartName/PartNumber/OriginalTitle).
 */

export interface FileMetadataEditorValues {
  quality?: string;
  source?: string;
  codec?: string;
  releaseGroup?: string;
  originalTitle?: string;
  languages?: string[];
  indexerFlags?: string;
  partName?: string;
  partNumber?: number | null;
}

export interface FileMetadataEditorProps {
  value: FileMetadataEditorValues;
  onChange: (next: FileMetadataEditorValues) => void;
  /** Hide a subset of fields (e.g. PartName when the event is single-part). */
  hideFields?: Array<keyof FileMetadataEditorValues>;
  /** Disable all inputs (read-only mode). */
  disabled?: boolean;
  /** Visual: compact two-column grid (default) vs vertical stack. */
  compact?: boolean;
}

interface KnownLists {
  qualities: string[];
  sources: string[];
  codecs: string[];
  indexerFlags: string[];
}

// Module-scoped cache so multiple editor instances on the same page don't
// each fetch the dropdown lists.
let knownListsCache: KnownLists | null = null;
let knownListsPromise: Promise<KnownLists> | null = null;

async function fetchKnownLists(): Promise<KnownLists> {
  if (knownListsCache) return knownListsCache;
  if (knownListsPromise) return knownListsPromise;
  knownListsPromise = apiClient
    .get<KnownLists>('/event-files/known-qualities')
    .then((res) => {
      knownListsCache = res.data;
      return res.data;
    })
    .catch(() => {
      // Conservative fallback when the endpoint is unreachable; matches the
      // server-side curated list so dropdowns aren't empty.
      const fb: KnownLists = {
        qualities: [
          'Unknown', 'SDTV', 'DVD',
          'WEBDL-480p', 'WEBRip-480p', 'Bluray-480p',
          'HDTV-720p', 'WEBDL-720p', 'WEBRip-720p', 'Bluray-720p',
          'HDTV-1080p', 'WEBDL-1080p', 'WEBRip-1080p', 'Bluray-1080p', 'Bluray-1080p Remux',
          'HDTV-2160p', 'WEBDL-2160p', 'WEBRip-2160p', 'Bluray-2160p', 'Bluray-2160p Remux',
          'Raw-HD',
        ],
        sources: ['WEBDL', 'WEBRip', 'BLURAY', 'HDTV', 'DVDRIP', 'RAWHD'],
        codecs: ['x264', 'x265', 'AV1', 'VP9', 'XviD', 'MPEG2'],
        indexerFlags: ['Freeleech', 'Halfleech', 'Internal', 'Scene', 'Nuked', 'DoubleUpload'],
      };
      knownListsCache = fb;
      return fb;
    });
  return knownListsPromise;
}

const COMMON_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Japanese', 'Korean', 'Chinese', 'Russian', 'Arabic', 'Hindi',
  'Dutch', 'Polish', 'Turkish', 'Swedish', 'Norwegian', 'Danish',
];

export default function FileMetadataEditor({
  value,
  onChange,
  hideFields = [],
  disabled = false,
  compact = true,
}: FileMetadataEditorProps) {
  const [lists, setLists] = useState<KnownLists | null>(knownListsCache);
  const [languageInput, setLanguageInput] = useState('');
  const [flagsList, setFlagsList] = useState<string[]>(() =>
    splitFlags(value.indexerFlags));

  useEffect(() => {
    if (!lists) fetchKnownLists().then(setLists);
  }, [lists]);

  // Keep flagsList in sync if value.indexerFlags changes externally.
  useEffect(() => {
    setFlagsList(splitFlags(value.indexerFlags));
  }, [value.indexerFlags]);

  const hidden = (k: keyof FileMetadataEditorValues) => hideFields.includes(k);

  const update = (patch: Partial<FileMetadataEditorValues>) =>
    onChange({ ...value, ...patch });

  const addLanguage = (lang: string) => {
    const trimmed = lang.trim();
    if (!trimmed) return;
    const current = value.languages ?? [];
    if (current.some((l) => l.toLowerCase() === trimmed.toLowerCase())) return;
    update({ languages: [...current, trimmed] });
    setLanguageInput('');
  };

  const removeLanguage = (lang: string) => {
    const current = value.languages ?? [];
    update({ languages: current.filter((l) => l !== lang) });
  };

  const toggleFlag = (flag: string) => {
    const has = flagsList.includes(flag);
    const next = has ? flagsList.filter((f) => f !== flag) : [...flagsList, flag];
    setFlagsList(next);
    update({ indexerFlags: next.length ? next.join(', ') : '' });
  };

  const containerClass = compact
    ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
    : 'flex flex-col gap-4';

  return (
    <div className={containerClass}>
      {!hidden('quality') && (
        <Field label="Quality">
          <Combo
            value={value.quality ?? ''}
            options={lists?.qualities ?? []}
            onChange={(v) => update({ quality: v })}
            placeholder="Select or type a quality"
            disabled={disabled}
          />
        </Field>
      )}

      {!hidden('source') && (
        <Field label="Source">
          <Combo
            value={value.source ?? ''}
            options={lists?.sources ?? []}
            onChange={(v) => update({ source: v })}
            placeholder="WEBDL, BLURAY, HDTV…"
            disabled={disabled}
          />
        </Field>
      )}

      {!hidden('codec') && (
        <Field label="Video Codec">
          <Combo
            value={value.codec ?? ''}
            options={lists?.codecs ?? []}
            onChange={(v) => update({ codec: v })}
            placeholder="x264, x265, AV1…"
            disabled={disabled}
          />
        </Field>
      )}

      {!hidden('releaseGroup') && (
        <Field label="Release Group">
          <input
            type="text"
            className={inputClass(disabled)}
            value={value.releaseGroup ?? ''}
            onChange={(e) => update({ releaseGroup: e.target.value })}
            placeholder="GROUP, NTb, FLUX…"
            disabled={disabled}
          />
        </Field>
      )}

      {!hidden('originalTitle') && (
        <Field label="Original Release Title" full>
          <input
            type="text"
            className={inputClass(disabled)}
            value={value.originalTitle ?? ''}
            onChange={(e) => update({ originalTitle: e.target.value })}
            placeholder="EPL.2026.05.02.match.1080p.WEB-DL.x264-GROUP"
            disabled={disabled}
          />
        </Field>
      )}

      {!hidden('languages') && (
        <Field label="Languages" full>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {(value.languages ?? []).map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1 rounded bg-emerald-900/40 text-emerald-200 text-xs px-2 py-1"
                >
                  {l}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeLanguage(l)}
                      className="ml-1 hover:text-white"
                      aria-label={`Remove ${l}`}
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {(value.languages ?? []).length === 0 && (
                <span className="text-gray-500 text-sm italic">No languages set</span>
              )}
            </div>
            {!disabled && (
              <div className="flex gap-2">
                <input
                  type="text"
                  list="fme-language-options"
                  className={inputClass(disabled) + ' flex-1'}
                  value={languageInput}
                  placeholder="Add language and press Enter"
                  onChange={(e) => setLanguageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLanguage(languageInput);
                    }
                  }}
                />
                <datalist id="fme-language-options">
                  {COMMON_LANGUAGES.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={() => addLanguage(languageInput)}
                  className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </Field>
      )}

      {!hidden('indexerFlags') && (
        <Field label="Indexer Flags" full>
          <div className="flex flex-wrap gap-2">
            {(lists?.indexerFlags ?? []).map((flag) => {
              const active = flagsList.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleFlag(flag)}
                  className={
                    'px-2.5 py-1 rounded text-xs border transition ' +
                    (active
                      ? 'bg-blue-700 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700') +
                    (disabled ? ' opacity-50 cursor-not-allowed' : '')
                  }
                >
                  {flag}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {!hidden('partName') && (
        <Field label="Part Name">
          <input
            type="text"
            className={inputClass(disabled)}
            value={value.partName ?? ''}
            onChange={(e) => update({ partName: e.target.value })}
            placeholder="Prelims, Main Card…"
            disabled={disabled}
          />
        </Field>
      )}

      {!hidden('partNumber') && (
        <Field label="Part Number">
          <input
            type="number"
            min={1}
            className={inputClass(disabled)}
            value={value.partNumber ?? ''}
            onChange={(e) =>
              update({ partNumber: e.target.value === '' ? null : parseInt(e.target.value, 10) })
            }
            placeholder="1, 2, 3…"
            disabled={disabled}
          />
        </Field>
      )}
    </div>
  );
}

// ---------- internal building blocks -----------------------------------------

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function inputClass(disabled: boolean) {
  return (
    'w-full rounded bg-gray-900 border border-gray-700 text-gray-100 px-3 py-1.5 text-sm ' +
    'focus:outline-none focus:border-blue-500 ' +
    (disabled ? 'opacity-60 cursor-not-allowed' : '')
  );
}

function Combo({
  value,
  options,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  // Native datalist gives us autocomplete + free-text in a tiny package; works
  // across all browsers, no popper / dropdown library needed.
  const id = `combo-${placeholder.replace(/\s+/g, '-')}`;
  return (
    <>
      <input
        type="text"
        list={id}
        className={inputClass(disabled)}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

// ---------- helpers ----------------------------------------------------------

function splitFlags(flags?: string | null): string[] {
  if (!flags) return [];
  return flags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
