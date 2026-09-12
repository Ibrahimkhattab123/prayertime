'use client';
import { Localized, useLanguage } from '@/components/language';
import { useEffect, useRef, useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';
import {
  filterPlaces,
  mergePlaces,
  placeLabel,
  searchCities,
  type Place,
} from '@/lib/location';
export function CitySearch({
  value,
  places,
  offline,
  disabled,
  onSelect,
  onSearchStart,
}: {
  value: Place | null;
  places: Place[];
  offline: boolean;
  disabled: boolean;
  onSelect: (place: Place) => void;
  onSearchStart: () => void;
}) {
  const { language } = useLanguage();
  const [query, setQuery] = useState(value ? placeLabel(value) : '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const selectedLabel = value ? placeLabel(value) : '';
  useEffect(() => {
    setQuery(selectedLabel);
  }, [value?.id, selectedLabel]);
  useEffect(() => {
    const id = ++generation.current;
    abort.current?.abort();
    setLoading(false);
    setResults([]);
    setMessage('');
    if (
      !open ||
      query.trim().length < 2 ||
      (value && query === placeLabel(value))
    )
      return;
    if (offline) {
      setMessage(
        'Offline: showing saved and starter cities. Use GPS for another location.',
      );
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    let timedOut = false;
    const delay = setTimeout(async () => {
      setLoading(true);
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);
      try {
        const found = await searchCities(
          query,
          controller.signal,
          fetch,
          language,
        );
        if (id === generation.current && !controller.signal.aborted)
          setResults(found);
      } catch (e) {
        if (
          id === generation.current &&
          (!controller.signal.aborted || timedOut)
        )
          setMessage(
            timedOut
              ? 'City search timed out. Try again or use GPS.'
              : String(e instanceof Error ? e.message : e),
          );
      } finally {
        clearTimeout(timeout);
        if (id === generation.current) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [query, open, offline, value?.id, selectedLabel, language]);
  const local = filterPlaces(
    places,
    value && query === placeLabel(value) ? '' : query,
  );
  const items = mergePlaces(results, local);
  function select(p: Place | null) {
    if (!p) return;
    ++generation.current;
    abort.current?.abort();
    setOpen(false);
    setQuery(placeLabel(p));
    setLoading(false);
    setMessage('');
    onSelect(p);
  }
  return (
    <Localized>
      <div
        className="city-search"
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement &&
            !event.nativeEvent.isComposing
          )
            event.preventDefault();
        }}
      >
        <label htmlFor="city-search">Search city</label>
        <Combobox<Place>
          autoHighlight
          disabled={disabled}
          items={items}
          filteredItems={items}
          filter={null}
          value={value}
          inputValue={query}
          open={open}
          onOpenChange={setOpen}
          onValueChange={select}
          itemToStringLabel={placeLabel}
          isItemEqualToValue={(a, b) => a.id === b.id}
          onInputValueChange={(text, details) => {
            if (details.reason === 'input-change') {
              ++generation.current;
              abort.current?.abort();
              setQuery(text);
              setResults([]);
              setOpen(true);
              onSearchStart();
            }
          }}
        >
          <ComboboxInput
            disabled={disabled}
            id="city-search"
            placeholder="City or town, e.g. Hamburg"
            autoComplete="off"
            showClear={false}
            aria-describedby="city-search-help"
          />
          <ComboboxContent>
            <div className="city-search-status" role="status">
              {loading
                ? 'Searching…'
                : message ||
                  (items.length
                    ? 'Select a city to set coordinates and timezone.'
                    : query.trim().length < 2
                      ? 'Type at least two letters.'
                      : 'No cities found. Try a nearby town or add a country.')}
            </div>
            <ComboboxList>
              {(p: Place) => (
                <ComboboxItem key={p.id} value={p}>
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {[p.region, p.country].filter(Boolean).join(', ') ||
                        `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)} · ${p.timezone}`}
                    </small>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <p id="city-search-help" className="field-note">
          Search by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{' '}
          /{' '}
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            GeoNames
          </a>
          . City queries use the internet.
        </p>
      </div>
    </Localized>
  );
}
