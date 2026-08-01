/**
 * Grandfriends Café — unit tests
 *
 * Setup (one-off, from the repo root):
 *   npm init -y
 *   npm i -D jest jest-environment-jsdom
 *   # in package.json:  "scripts": { "test": "jest" }
 *   npm test
 *
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

/** Boot index.html into jsdom and hand back the exposed namespace. */
function boot() {
  document.documentElement.innerHTML = HTML;
  // jsdom does not run <script src>, so only the inline module executes —
  // which is exactly the code under test. window.L stays undefined, so the
  // map fallback path is what runs here.
  const inline = [...document.querySelectorAll('script:not([src])')].pop();
  // eslint-disable-next-line no-new-func
  new Function(inline.textContent)();
  return window.GF;
}

describe('data model', () => {
  const GF = boot();

  test('exposes exactly the five required landmarks', () => {
    expect(GF.PLACES).toHaveLength(5);
    expect(GF.PLACES.map((p) => p.id)).toEqual([
      'cafe', 'post-office', 'supermarket', 'bus-stop', 'gp-surgery',
    ]);
  });

  test('every place has usable coordinates inside the Leeds area', () => {
    GF.PLACES.forEach((place) => {
      const [lat, lng] = place.coords;
      expect(lat).toBeGreaterThan(53.7);
      expect(lat).toBeLessThan(53.95);
      expect(lng).toBeGreaterThan(-1.8);
      expect(lng).toBeLessThan(-1.4);
    });
  });

  test('every place has at least one guide with a title', () => {
    GF.PLACES.forEach((place) => {
      expect(place.guides.length).toBeGreaterThan(0);
      place.guides.forEach((g) => expect(typeof g.title).toBe('string'));
    });
  });

  test('the data array is frozen against accidental mutation', () => {
    expect(Object.isFrozen(GF.PLACES)).toBe(true);
  });

  test('every place points at an icon that actually exists in the sprite', () => {
    GF.PLACES.forEach((place) => {
      const symbol = document.getElementById(place.icon);
      expect(symbol).not.toBeNull();
      expect(symbol.tagName.toLowerCase()).toBe('symbol');
      expect(symbol.getAttribute('viewBox')).toBe('0 0 64 64');
    });
  });
});

describe('clampIndex', () => {
  const GF = boot();

  test.each([
    [0, 3, 0],
    [2, 3, 2],
    [5, 3, 2],   // clamps, never wraps to 0
    [-4, 3, 0],
    [1.5, 3, 0], // non-integer falls back to first
  ])('clampIndex(%p, %p) === %p', (i, len, expected) => {
    expect(GF.clampIndex(i, len)).toBe(expected);
  });

  test('an empty or invalid list returns 0 rather than -1', () => {
    expect(GF.clampIndex(2, 0)).toBe(0);
    expect(GF.clampIndex(2, null)).toBe(0);
  });
});

describe('normaliseSize', () => {
  const GF = boot();

  test('passes through the three valid sizes', () => {
    ['normal', 'large', 'largest'].forEach((s) => expect(GF.normaliseSize(s)).toBe(s));
  });

  test('falls back to normal for junk from storage', () => {
    ['', 'HUGE', null, undefined, '<script>'].forEach((s) => {
      expect(GF.normaliseSize(s)).toBe('normal');
    });
  });
});

describe('findPlace', () => {
  const GF = boot();

  test('finds a known place', () => {
    expect(GF.findPlace('gp-surgery').name).toBe('Vesper Road Surgery');
  });

  test('returns null for anything unknown or malformed', () => {
    [ 'nope', '', null, undefined, 42, {} ].forEach((id) => {
      expect(GF.findPlace(id)).toBeNull();
    });
  });
});

describe('createStore', () => {
  const GF = boot();

  test('uses real localStorage when it is available', () => {
    const store = GF.createStore(window);
    store.setItem('gf.test', 'yes');
    expect(store.getItem('gf.test')).toBe('yes');
    store.removeItem('gf.test');
    expect(store.getItem('gf.test')).toBeNull();
  });

  test('falls back to memory when localStorage throws, without propagating', () => {
    const hostile = {
      get localStorage() { throw new DOMException('denied', 'SecurityError'); },
    };
    let store;
    expect(() => { store = GF.createStore(hostile); }).not.toThrow();
    store.setItem('gf.textSize', 'largest');
    expect(store.getItem('gf.textSize')).toBe('largest');
    expect(store.getItem('never-set')).toBeNull();
  });
});

describe('rendering and interaction', () => {
  test('renders one button per place before any map exists', () => {
    boot();
    const buttons = document.querySelectorAll('#places .place');
    expect(buttons).toHaveLength(5);
    expect(buttons[1].getAttribute('aria-label')).toMatch(/Hawksworth Estate Post Office/);
  });

  test('shows the plain-English fallback when Leaflet is missing', () => {
    boot();
    expect(document.getElementById('map').textContent).toMatch(/could not load/i);
  });

  test('clicking a place fills the dialog with that place\'s guides', () => {
    boot();
    document.querySelector('[data-place="gp-surgery"]').click();
    expect(document.getElementById('dialog-title').textContent).toBe('Vesper Road Surgery');
    expect(document.querySelectorAll('#dialog-body .guide')).toHaveLength(3);
    expect(document.querySelector('.draft-note')).not.toBeNull();
  });

  test('text size buttons swap the class and keep aria-pressed truthful', () => {
    boot();
    document.querySelector('[data-size="largest"]').click();
    expect(document.documentElement.classList.contains('text-largest')).toBe(true);
    expect(document.documentElement.classList.contains('text-normal')).toBe(false);
    expect(document.querySelector('[data-size="normal"]').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-size="largest"]').getAttribute('aria-pressed')).toBe('true');
  });

  test('high contrast toggles on and back off again', () => {
    boot();
    const toggle = document.getElementById('contrast-toggle');
    toggle.click();
    expect(document.documentElement.classList.contains('hc')).toBe(true);
    toggle.click();
    expect(document.documentElement.classList.contains('hc')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });
});
