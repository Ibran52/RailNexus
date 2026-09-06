import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage';
import { PublicAuthLayout } from '../components/PublicAuthLayout';

describe('RailNexus Landing Page Reference UI Verification', () => {
  const renderLandingPage = () => {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<PublicAuthLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<div>Login</div>} />
            <Route path="/register" element={<div>Registration</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders green top navbar with RailwayLogo and only Home, Login, Registration links', () => {
    renderLandingPage();

    // Check header and logo
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
    expect(screen.getByLabelText(/railnexus railway logo/i)).toBeInTheDocument();

    // Check navbar links
    const homeLink = screen.getByRole('link', { name: /^home$/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');

    // Get all login and registration links (navbar + hero CTA buttons)
    const loginLinks = screen.getAllByRole('link', { name: /^login$/i });
    expect(loginLinks.length).toBeGreaterThanOrEqual(2);
    expect(loginLinks[0]).toHaveAttribute('href', '/login');

    const regLinks = screen.getAllByRole('link', { name: /^registration$/i });
    expect(regLinks.length).toBeGreaterThanOrEqual(2);
    expect(regLinks[0]).toHaveAttribute('href', '/register');

    // Ensure NO unnecessary SaaS navbar items exist
    expect(screen.queryByText(/pricing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/analytics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/services/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/about/i)).not.toBeInTheDocument();
  });

  it('renders hero section with dark overlay, centered RailNexus copy, and no reference placeholder content', () => {
    renderLandingPage();

    // Welcome small text
    expect(screen.getByText('Welcome to RailNexus')).toBeInTheDocument();

    // Main heading
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /railway maintenance decision-support system/i
    );

    // Subtitle
    expect(
      screen.getByText('Intelligent coordination for railway maintenance planning')
    ).toBeInTheDocument();

    // Explicitly verify NO Pakistan / Quetta or ticket booking placeholder copy exists
    expect(screen.queryByText(/quetta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pakistan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/book train now/i)).not.toBeInTheDocument();
  });

  it('contains centered CTA buttons linking to /login and /register', () => {
    renderLandingPage();

    const ctaLogin = screen.getAllByRole('link', { name: /^login$/i })[1];
    const ctaRegister = screen.getAllByRole('link', { name: /^registration$/i })[1];

    expect(ctaLogin).toHaveAttribute('href', '/login');
    expect(ctaRegister).toHaveAttribute('href', '/register');
  });

  it('uses /assets/railway-hero.jpg for hero background image', () => {
    renderLandingPage();
    const heroMain = screen.getByRole('main');
    expect(heroMain).toHaveStyle({
      backgroundImage: "url('/assets/railway-hero.jpg')",
    });
  });
});
