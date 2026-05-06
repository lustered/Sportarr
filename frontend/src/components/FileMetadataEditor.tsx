import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import apiClient from '../api/client';

/**
 * Shared editor component for EventFile metadata. Used in five places with
 * identical look and behavior:
 *   1. Post-import per-row pencil edit (Files panel — per-event)
 *   2. Post-import per-row pencil edit (Files panel — per-league)
 *   3. ManualImportModal pre-import editing
 *   4. LibraryImportPage pre-import editing
 *   5. ActivityPage PendingImport pre-import editing (via ManualImportModal)
 *
 * Controlled component: parent owns `value` and `onChange`. Native <select>
 * elements match Sportarr's existing modal dropdown style (gray-800 with
 * red/blue focus ring). Selects show all canonical options at once; values
 * outside the canonical list are preserved by appending them as a one-off
 * top option so the user's existing data is never lost or hidden.
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

const FALLBACK_LISTS: KnownLists = {
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
      knownListsCache = FALLBACK_LISTS;
      return FALLBACK_LISTS;
    });
  return knownListsPromise;
}

const COMMON_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Japanese', 'Korean', 'Chinese', 'Russian', 'Arabic', 'Hindi',
  'Dutch', 'Polish', 'Turkish', 'Swedish', 'Norwegian', 'Danish',
];

// Sentinel used by the Quality/Source/Codec selects to switch into custom-text mode.
const CUSTOM_OPTION = '__custom__';
const NO_VALUE = '__none__';

export default function FileMetadataEditor({
  value,
  onChange,
  hideFields = [],
  disabled = false,
}: FileMetadataEditorProps) {
  const [lists, setLists] = useState<KnownLists | null>(knownListsCache ?? FALLBACK_LISTS);
  const [languageToAdd, setLanguageToAdd] = useState('');
  const [flagsList, setFlagsList] = useState<string[]>(() =>
    splitFlags(value.indexerFlags));

  // "Custom" mode for the closed-list selects. Once enabled, render a free-text
  // input next to the select so the user can type a value the canonical list
  // doesn't include without losing their place.
  const [customQuality, setCustomQuality] = useState(false);
  const [customSource, setCustomSource] = useState(false);
  const [customCodec, setCustomCodec] = useState(false);

  useEffect(() => {
    if (!knownListsCache) fetchKnownLists().then(setLists);
  }, []);

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
    setLanguageToAdd('');
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {!hidden('quality') && (
        <SelectField
          label="Quality"
          value={value.quality}
          options={lists?.qualities ?? FALLBACK_LISTS.qualities}
          onChange={(v) => update({ quality: v })}
          disabled={disabled}
          customMode={customQuality}
          onCustomToggle={setCustomQuality}
          allowEmpty
        />
      )}

      {!hidden('source') && (
        <SelectField
          label="Source"
          value={value.source}
          options={lists?.sources ?? FALLBACK_LISTS.sources}
          onChange={(v) => update({ source: v })}
          disabled={disabled}
          customMode={customSource}
          onCustomToggle={setCustomSource}
          allowEmpty
        />
      )}

      {!hidden('codec') && (
        <SelectField
          label="Video Codec"
          value={value.codec}
          options={lists?.codecs ?? FALLBACK_LISTS.codecs}
          onChange={(v) => update({ codec: v })}
          disabled={disabled}
          customMode={customCodec}
          onCustomToggle={setCustomCodec}
          allowEmpty
        />
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
            <div className="flex flex-wrap gap-2 min-h-[1.75rem]">
              {(value.languages ?? []).map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1 rounded bg-emerald-900/40 text-emerald-200 text-xs px-2 py-1 border border-emerald-700/40"
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
                <select
                  className={inputClass(disabled) + ' flex-1'}
                  value={languageToAdd}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      setLanguageToAdd('');
                    } else if (e.target.value === CUSTOM_OPTION) {
                      setLanguageToAdd('');
                    } else {
                      addLanguage(e.target.value);
                    }
                  }}
                >
                  <option value="">Add a language…</option>
                  {COMMON_LANGUAGES.filter(
                    (l) => !(value.languages ?? []).some((existing) => existing.toLowerCase() === l.toLowerCase()),
                  ).map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <input
                  type="text"
                  className={inputClass(disabled) + ' flex-1'}
                  value={languageToAdd}
                  placeholder="…or type a custom one"
                  onChange={(e) => setLanguageToAdd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLanguage(languageToAdd);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => addLanguage(languageToAdd)}
                  disabled={!languageToAdd.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
            {(lists?.indexerFlags ?? FALLBACK_LISTS.indexerFlags).map((flag) => {
              const active = flagsList.includes(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleFlag(flag)}
                  className={
                    'px-3 py-1.5 rounded-lg text-xs border transition-colors ' +
                    (active
                      ? 'bg-blue-700 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:border-gray-500') +
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
      <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1.5 font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function inputClass(disabled: boolean) {
  return (
    'w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-4 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
    'placeholder-gray-500 ' +
    (disabled ? 'opacity-60 cursor-not-allowed' : '')
  );
}

/**
 * Closed-list select with a "Custom…" escape hatch. Native `<select>` matches
 * the rest of the app's dropdowns; clicking shows every option in one go,
 * not just substring matches. When the bound value isn't one of the canonical
 * options it gets added as a sentinel top option so the user's existing
 * data is preserved and visible.
 */
function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  customMode,
  onCustomToggle,
  allowEmpty,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string | undefined) => void;
  disabled: boolean;
  customMode: boolean;
  onCustomToggle: (b: boolean) => void;
  allowEmpty?: boolean;
}) {
  // Show the existing value as a select option even if it's not in the canonical
  // list. Avoids hiding "TS", "Unknown", or odd legacy strings.
  const valueIsCanonical = value != null && options.some((o) => o.toLowerCase() === value.toLowerCase());
  const showInline = customMode || (value != null && !valueIsCanonical && !options.includes(value));

  return (
    <Field label={label}>
      <div className="flex gap-2">
        {showInline ? (
          <>
            <input
              type="text"
              className={inputClass(disabled)}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value || undefined)}
              placeholder={`Custom ${label.toLowerCase()}`}
              disabled={disabled}
              autoFocus={customMode}
            />
            <button
              type="button"
              onClick={() => onCustomToggle(false)}
              disabled={disabled}
              className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs whitespace-nowrap"
              title="Switch back to dropdown"
            >
              List…
            </button>
          </>
        ) : (
          <select
            className={inputClass(disabled)}
            value={value ?? (allowEmpty ? NO_VALUE : '')}
            onChange={(e) => {
              if (e.target.value === CUSTOM_OPTION) {
                onCustomToggle(true);
                return;
              }
              if (e.target.value === NO_VALUE) {
                onChange(undefined);
                return;
              }
              onChange(e.target.value);
            }}
            disabled={disabled}
          >
            {allowEmpty && <option value={NO_VALUE}>— not set —</option>}
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
            <option value={CUSTOM_OPTION}>Custom…</option>
          </select>
        )}
      </div>
    </Field>
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
