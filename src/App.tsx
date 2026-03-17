import { useDeferredValue, useEffect, useRef, useState, type ChangeEvent } from 'react'
import './App.css'

type Country = {
  cca3: string
  name: {
    common: string
    official: string
  }
  flags?: {
    svg?: string
    png?: string
    alt?: string
  }
  population: number
  area: number
  region: string
  subregion?: string
  capital?: string[]
  languages?: Record<string, string>
  currencies?: Record<string, { name: string; symbol?: string }>
  timezones: string[]
}

type ForecastDay = {
  date: string
  tempMax: number
  tempMin: number
  precipitationProbability: number
  weatherCode: number
}

type PlannerChecklistItem = {
  id: string
  label: string
  packed: boolean
}

type PlannerState = {
  notes: string
  checklist: PlannerChecklistItem[]
}

type StoredPlannerPayload = {
  version: number
  exportedAt: string
  plans: Record<string, PlannerState>
}

type WeatherState = {
  status: 'idle' | 'loading' | 'success' | 'error'
  capitalName: string
  days: ForecastDay[]
  message: string
}

const REST_COUNTRIES_URL =
  'https://restcountries.com/v3.1/all?fields=cca3,name,flags,population,area,region,subregion,capital,languages,currencies,timezones'
const STORAGE_KEY = 'country-compass-plans-v1'
const plannerStarterItems = [
  'Passport and travel documents',
  'Phone charger and adapter',
  'Weather-appropriate layers',
  'Comfortable walking shoes',
  'Any medications',
]

const numberFormatter = new Intl.NumberFormat('en-US')
const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function createDefaultPlanner(): PlannerState {
  return {
    notes: '',
    checklist: plannerStarterItems.map((label, index) => ({
      id: `starter-${index}`,
      label,
      packed: false,
    })),
  }
}

function clonePlanner(plan: PlannerState): PlannerState {
  return {
    notes: plan.notes,
    checklist: plan.checklist.map((item) => ({ ...item })),
  }
}

function normalizePlannerRecord(value: unknown): Record<string, PlannerState> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const rawPlans = value as Record<string, unknown>
  const normalizedPlans: Record<string, PlannerState> = {}

  Object.entries(rawPlans).forEach(([countryCode, plannerValue]) => {
    if (!plannerValue || typeof plannerValue !== 'object') {
      return
    }

    const rawPlanner = plannerValue as Partial<PlannerState>
    const fallbackChecklist = createDefaultPlanner().checklist
    const notes =
      typeof rawPlanner.notes === 'string' ? rawPlanner.notes : ''
    const checklist = Array.isArray(rawPlanner.checklist)
      ? rawPlanner.checklist
          .filter(
            (item): item is PlannerChecklistItem => {
              if (!item || typeof item !== 'object') {
                return false
              }

              const candidate = item as Record<string, unknown>
              return (
                typeof candidate.id === 'string' &&
                typeof candidate.label === 'string' &&
                typeof candidate.packed === 'boolean'
              )
            },
          )
          .map((item) => ({ ...item }))
      : fallbackChecklist

    normalizedPlans[countryCode] = { notes, checklist }
  })

  return normalizedPlans
}

function formatPopulation(population: number): string {
  return compactNumberFormatter.format(population)
}

function formatArea(area: number): string {
  return `${numberFormatter.format(Math.round(area))} km²`
}

function getWeatherLabel(weatherCode: number): string {
  if (weatherCode === 0) return 'Clear'
  if (weatherCode <= 3) return 'Partly cloudy'
  if (weatherCode <= 48) return 'Fog'
  if (weatherCode <= 67) return 'Rain'
  if (weatherCode <= 77) return 'Snow'
  if (weatherCode <= 82) return 'Showers'
  if (weatherCode <= 86) return 'Snow showers'
  if (weatherCode <= 99) return 'Storms'
  return 'Mixed'
}

function getWeatherIcon(weatherCode: number): string {
  if (weatherCode === 0) return '☀'
  if (weatherCode <= 3) return '⛅'
  if (weatherCode <= 48) return '〰'
  if (weatherCode <= 67) return '🌧'
  if (weatherCode <= 77) return '❄'
  if (weatherCode <= 82) return '🌦'
  if (weatherCode <= 86) return '🌨'
  if (weatherCode <= 99) return '⛈'
  return '•'
}

function formatForecastDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

function App() {
  const [countries, setCountries] = useState<Country[]>([])
  const [countriesStatus, setCountriesStatus] = useState<
    'loading' | 'success' | 'error'
  >('loading')
  const [countriesError, setCountriesError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [regionFilter, setRegionFilter] = useState('All')
  const [compareCodes, setCompareCodes] = useState<string[]>([])
  const [activeCountryCode, setActiveCountryCode] = useState<string>('')
  const [plannerByCountry, setPlannerByCountry] = useState<
    Record<string, PlannerState>
  >({})
  const [plannerReady, setPlannerReady] = useState(false)
  const [weatherState, setWeatherState] = useState<WeatherState>({
    status: 'idle',
    capitalName: '',
    days: [],
    message: '',
  })
  const [checklistDraft, setChecklistDraft] = useState('')
  const [plannerMessage, setPlannerMessage] = useState('')
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const deferredSearchTerm = useDeferredValue(searchTerm.trim().toLowerCase())

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (!saved) {
        return
      }

      const parsed = JSON.parse(saved) as Partial<StoredPlannerPayload>
      const plans =
        parsed && typeof parsed === 'object' && parsed.plans
          ? normalizePlannerRecord(parsed.plans)
          : normalizePlannerRecord(parsed)
      setPlannerByCountry(plans)
    } catch {
      setPlannerMessage('Saved planner data could not be restored.')
    } finally {
      setPlannerReady(true)
    }
  }, [])

  useEffect(() => {
    if (!plannerReady) {
      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        plans: plannerByCountry,
      } satisfies StoredPlannerPayload),
    )
  }, [plannerByCountry, plannerReady])

  useEffect(() => {
    const controller = new AbortController()

    async function loadCountries() {
      setCountriesStatus('loading')
      setCountriesError('')

      try {
        const response = await fetch(REST_COUNTRIES_URL, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Country lookup failed with ${response.status}`)
        }

        const payload = (await response.json()) as Country[]
        const sorted = payload.sort((left, right) =>
          left.name.common.localeCompare(right.name.common),
        )
        setCountries(sorted)
        setCountriesStatus('success')

        setActiveCountryCode((current) => current || sorted[0]?.cca3 || '')
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setCountriesStatus('error')
        setCountriesError(
          error instanceof Error
            ? error.message
            : 'Unable to load countries right now.',
        )
      }
    }

    void loadCountries()

    return () => controller.abort()
  }, [])

  const regions = ['All', ...new Set(countries.map((country) => country.region))]
  const filteredCountries = countries.filter((country) => {
    const matchesRegion =
      regionFilter === 'All' || country.region === regionFilter
    const searchTarget = [
      country.name.common,
      country.name.official,
      country.region,
      country.subregion ?? '',
      country.capital?.join(' ') ?? '',
    ]
      .join(' ')
      .toLowerCase()

    const matchesSearch =
      deferredSearchTerm.length === 0 || searchTarget.includes(deferredSearchTerm)

    return matchesRegion && matchesSearch
  })

  const activeCountry =
    countries.find((country) => country.cca3 === activeCountryCode) ??
    filteredCountries[0] ??
    countries[0] ??
    null
  const comparedCountries = compareCodes
    .map((code) => countries.find((country) => country.cca3 === code) ?? null)
    .filter((country): country is Country => country !== null)
  const activePlanner = activeCountry
    ? clonePlanner(plannerByCountry[activeCountry.cca3] ?? createDefaultPlanner())
    : createDefaultPlanner()

  useEffect(() => {
    if (!activeCountry) {
      return
    }

    const capitalName = activeCountry.capital?.[0] ?? ''
    if (!capitalName) {
      setWeatherState({
        status: 'error',
        capitalName: '',
        days: [],
        message: 'No capital city is available for this country.',
      })
      return
    }

    const controller = new AbortController()

    async function loadWeather() {
      setWeatherState({
        status: 'loading',
        capitalName,
        days: [],
        message: '',
      })

      try {
        const geocodingResponse = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(capitalName)}&count=1&language=en&format=json`,
          { signal: controller.signal },
        )
        if (!geocodingResponse.ok) {
          throw new Error(`Geocoding failed with ${geocodingResponse.status}`)
        }

        const geocodingPayload = (await geocodingResponse.json()) as {
          results?: Array<{ latitude: number; longitude: number; name: string }>
        }
        const city = geocodingPayload.results?.[0]

        if (!city) {
          throw new Error(`No geocoding result found for ${capitalName}.`)
        }

        const forecastResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=5&timezone=auto`,
          { signal: controller.signal },
        )
        if (!forecastResponse.ok) {
          throw new Error(`Forecast failed with ${forecastResponse.status}`)
        }

        const forecastPayload = (await forecastResponse.json()) as {
          daily?: {
            time: string[]
            temperature_2m_max: number[]
            temperature_2m_min: number[]
            precipitation_probability_max: number[]
            weather_code: number[]
          }
        }

        const daily = forecastPayload.daily
        if (!daily) {
          throw new Error('Forecast data was incomplete.')
        }

        const days = daily.time.map((date, index) => ({
          date,
          tempMax: daily.temperature_2m_max[index],
          tempMin: daily.temperature_2m_min[index],
          precipitationProbability:
            daily.precipitation_probability_max[index] ?? 0,
          weatherCode: daily.weather_code[index] ?? 0,
        }))

        setWeatherState({
          status: 'success',
          capitalName: city.name,
          days,
          message: '',
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setWeatherState({
          status: 'error',
          capitalName,
          days: [],
          message:
            error instanceof Error
              ? error.message
              : 'Unable to load the capital forecast.',
        })
      }
    }

    void loadWeather()

    return () => controller.abort()
  }, [activeCountry])

  function upsertPlanner(countryCode: string, updater: (plan: PlannerState) => PlannerState) {
    setPlannerByCountry((current) => {
      const base = clonePlanner(current[countryCode] ?? createDefaultPlanner())
      return {
        ...current,
        [countryCode]: updater(base),
      }
    })
  }

  function toggleCompare(countryCode: string) {
    setCompareCodes((current) => {
      if (current.includes(countryCode)) {
        return current.filter((code) => code !== countryCode)
      }
      if (current.length >= 3) {
        return current
      }
      return [...current, countryCode]
    })
  }

  function exportPlans() {
    const payload: StoredPlannerPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: plannerByCountry,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'country-compass-planner.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setPlannerMessage('Planner data exported as JSON.')
  }

  async function importPlans(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Partial<StoredPlannerPayload>
      const plans =
        parsed && typeof parsed === 'object' && parsed.plans
          ? normalizePlannerRecord(parsed.plans)
          : normalizePlannerRecord(parsed)
      setPlannerByCountry(plans)
      setPlannerMessage('Planner data imported successfully.')
    } catch {
      setPlannerMessage('Planner import failed. Use a valid JSON export.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">CountryCompass</p>
          <h1>Compare countries and sketch a trip plan without leaving one dashboard.</h1>
          <p className="hero-text">
            Search a live country catalog, pin up to three destinations, and plan
            around the capital forecast with notes and a checklist that stays on
            this device.
          </p>
        </div>
        <div className="hero-stats" aria-label="Application quick stats">
          <article>
            <span>{numberFormatter.format(countries.length)}</span>
            <p>Countries loaded</p>
          </article>
          <article>
            <span>{numberFormatter.format(filteredCountries.length)}</span>
            <p>Explorer matches</p>
          </article>
          <article>
            <span>{compareCodes.length}/3</span>
            <p>Compare slots used</p>
          </article>
          <article>
            <span>{activeCountry?.capital?.[0] ?? 'N/A'}</span>
            <p>Planner focus capital</p>
          </article>
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">1. Country explorer</p>
            <h2>Filter the world down to a shortlist fast.</h2>
          </div>
          <div className="controls">
            <label>
              <span>Search</span>
              <input
                type="search"
                placeholder="Search name, capital, region..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <label>
              <span>Region</span>
              <select
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value)}
              >
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {countriesStatus === 'loading' && (
          <div className="empty-state">Loading countries from REST Countries…</div>
        )}

        {countriesStatus === 'error' && (
          <div className="empty-state error-state">
            {countriesError || 'Unable to load countries.'}
          </div>
        )}

        {countriesStatus === 'success' && (
          <div className="country-grid">
            {filteredCountries.map((country) => {
              const isCompared = compareCodes.includes(country.cca3)
              const isActive = activeCountry?.cca3 === country.cca3

              return (
                <article
                  key={country.cca3}
                  className={`country-card${isActive ? ' country-card-active' : ''}`}
                >
                  <div className="country-card-header">
                    <img
                      src={country.flags?.svg ?? country.flags?.png}
                      alt={country.flags?.alt ?? `${country.name.common} flag`}
                    />
                    <div>
                      <h3>{country.name.common}</h3>
                      <p>{country.capital?.[0] ?? 'No listed capital'}</p>
                    </div>
                  </div>

                  <dl className="stat-grid">
                    <div>
                      <dt>Population</dt>
                      <dd>{formatPopulation(country.population)}</dd>
                    </div>
                    <div>
                      <dt>Area</dt>
                      <dd>{formatArea(country.area)}</dd>
                    </div>
                    <div>
                      <dt>Region</dt>
                      <dd>{country.region}</dd>
                    </div>
                    <div>
                      <dt>Timezone</dt>
                      <dd>{country.timezones[0]}</dd>
                    </div>
                  </dl>

                  <div className="card-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setActiveCountryCode(country.cca3)}
                    >
                      {isActive ? 'Focused' : 'Open planner'}
                    </button>
                    <button
                      type="button"
                      className={`accent-button${isCompared ? ' is-selected' : ''}`}
                      onClick={() => toggleCompare(country.cca3)}
                      disabled={!isCompared && compareCodes.length >= 3}
                    >
                      {isCompared ? 'Unpin compare' : 'Pin to compare'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">2. Country compare</p>
            <h2>Keep up to three destinations in a single side-by-side frame.</h2>
          </div>
        </div>

        <div className="compare-grid">
          {[0, 1, 2].map((slot) => {
            const country = comparedCountries[slot]

            if (!country) {
              return (
                <article key={`empty-${slot}`} className="compare-card compare-empty">
                  <p>Compare slot {slot + 1}</p>
                  <span>Pin a country from the explorer to populate this column.</span>
                </article>
              )
            }

            return (
              <article key={country.cca3} className="compare-card">
                <div className="compare-title">
                  <img
                    src={country.flags?.svg ?? country.flags?.png}
                    alt={country.flags?.alt ?? `${country.name.common} flag`}
                  />
                  <div>
                    <h3>{country.name.common}</h3>
                    <p>{country.name.official}</p>
                  </div>
                </div>
                <ul className="compare-metrics">
                  <li>
                    <strong>Population</strong>
                    <span>{numberFormatter.format(country.population)}</span>
                  </li>
                  <li>
                    <strong>Area</strong>
                    <span>{formatArea(country.area)}</span>
                  </li>
                  <li>
                    <strong>Region</strong>
                    <span>
                      {country.region}
                      {country.subregion ? ` · ${country.subregion}` : ''}
                    </span>
                  </li>
                  <li>
                    <strong>Currencies</strong>
                    <span>
                      {country.currencies
                        ? Object.values(country.currencies)
                            .map((currency) => currency.name)
                            .join(', ')
                        : 'Not listed'}
                    </span>
                  </li>
                  <li>
                    <strong>Languages</strong>
                    <span>
                      {country.languages
                        ? Object.values(country.languages).join(', ')
                        : 'Not listed'}
                    </span>
                  </li>
                  <li>
                    <strong>Timezones</strong>
                    <span>{country.timezones.join(', ')}</span>
                  </li>
                </ul>
              </article>
            )
          })}
        </div>
      </section>

      <section className="section-card planner-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">3. Trip planner</p>
            <h2>Plan around the capital forecast and keep a persistent prep list.</h2>
          </div>
          <div className="planner-toolbar">
            <button type="button" className="secondary-button" onClick={exportPlans}>
              Export JSON
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => importInputRef.current?.click()}
            >
              Import JSON
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={importPlans}
            />
          </div>
        </div>

        {activeCountry ? (
          <>
            <div className="planner-summary">
              <div>
                <p className="planner-label">Focused country</p>
                <h3>{activeCountry.name.common}</h3>
                <p>
                  {activeCountry.capital?.[0] ?? 'No listed capital'} ·{' '}
                  {activeCountry.region}
                </p>
              </div>
              <div className="planner-badges">
                <span>{activeCountry.timezones.join(', ')}</span>
                <span>
                  {activeCountry.languages
                    ? Object.values(activeCountry.languages).join(', ')
                    : 'Language data unavailable'}
                </span>
              </div>
            </div>

            <div className="planner-grid">
              <section className="planner-panel">
                <div className="panel-heading">
                  <h3>5-day capital forecast</h3>
                  <p>
                    {weatherState.capitalName
                      ? `via Open-Meteo for ${weatherState.capitalName}`
                      : 'Waiting for forecast'}
                  </p>
                </div>

                {weatherState.status === 'loading' && (
                  <div className="empty-state">Loading forecast…</div>
                )}
                {weatherState.status === 'error' && (
                  <div className="empty-state error-state">{weatherState.message}</div>
                )}
                {weatherState.status === 'success' && (
                  <div className="forecast-grid">
                    {weatherState.days.map((day) => (
                      <article key={day.date} className="forecast-card">
                        <p>{formatForecastDate(day.date)}</p>
                        <span>{getWeatherIcon(day.weatherCode)}</span>
                        <strong>{getWeatherLabel(day.weatherCode)}</strong>
                        <small>
                          {Math.round(day.tempMin)}° / {Math.round(day.tempMax)}°
                        </small>
                        <small>{day.precipitationProbability}% precip.</small>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="planner-panel">
                <div className="panel-heading">
                  <h3>Notes</h3>
                  <p>Saved in localStorage per country.</p>
                </div>
                <textarea
                  rows={8}
                  placeholder="Visa reminders, neighborhoods to stay in, airport transfer notes..."
                  value={activePlanner.notes}
                  onChange={(event) =>
                    upsertPlanner(activeCountry.cca3, (plan) => ({
                      ...plan,
                      notes: event.target.value,
                    }))
                  }
                />
              </section>

              <section className="planner-panel planner-panel-wide">
                <div className="panel-heading">
                  <h3>Packing checklist</h3>
                  <p>Keep a reusable list for this destination.</p>
                </div>

                <div className="checklist-create">
                  <input
                    type="text"
                    placeholder="Add a checklist item"
                    value={checklistDraft}
                    onChange={(event) => setChecklistDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    className="accent-button"
                    onClick={() => {
                      const trimmed = checklistDraft.trim()
                      if (!trimmed) {
                        return
                      }

                      upsertPlanner(activeCountry.cca3, (plan) => ({
                        ...plan,
                        checklist: [
                          ...plan.checklist,
                          {
                            id: `${Date.now()}-${trimmed.toLowerCase().replace(/\s+/g, '-')}`,
                            label: trimmed,
                            packed: false,
                          },
                        ],
                      }))
                      setChecklistDraft('')
                    }}
                  >
                    Add item
                  </button>
                </div>

                <div className="checklist-list">
                  {activePlanner.checklist.map((item) => (
                    <label key={item.id} className="checklist-item">
                      <input
                        type="checkbox"
                        checked={item.packed}
                        onChange={() =>
                          upsertPlanner(activeCountry.cca3, (plan) => ({
                            ...plan,
                            checklist: plan.checklist.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, packed: !entry.packed }
                                : entry,
                            ),
                          }))
                        }
                      />
                      <span>{item.label}</span>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          upsertPlanner(activeCountry.cca3, (plan) => ({
                            ...plan,
                            checklist: plan.checklist.filter(
                              (entry) => entry.id !== item.id,
                            ),
                          }))
                        }
                        aria-label={`Remove ${item.label}`}
                      >
                        Remove
                      </button>
                    </label>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="empty-state">
            Choose a country in the explorer to unlock the planner.
          </div>
        )}

        {plannerMessage && <p className="planner-message">{plannerMessage}</p>}
      </section>
    </main>
  )
}

export default App
