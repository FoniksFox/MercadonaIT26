import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should show the brand, the views and the store switch in the sidebar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector('aside')!;

    expect(sidebar.textContent).toContain('MercaTrack');
    const links = [...sidebar.querySelectorAll('nav a')].map((link) => link.textContent?.trim());
    expect(links.slice(0, 4)).toEqual(['Mapas', 'Gestión', 'Estadísticas', 'Configuración']);
    expect(links[4]).toContain('Valencia Centro');
    expect(links[4]).toContain('Cambiar de Mercadona');
  });

  it('should start in light mode and switch to dark with the toggle', async () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(false);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('aside button')!.click();
    await fixture.whenStable();
    expect(root.classList.contains('dark')).toBe(true);

    root.classList.remove('dark');
    localStorage.clear();
  });
});
