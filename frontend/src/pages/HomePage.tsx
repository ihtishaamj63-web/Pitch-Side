import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, readableError } from '../api';
import { ErrorNotice, Loading, PageMotion } from '../components/common';
import { useApi } from '../features/api/useApi';
import type { LeagueSummary } from '../types';

export function LeagueHome() {
  const {
    data: leagueData,
    loading,
    error,
    refresh,
    setData: setLeagues,
    setError,
  } = useApi('leagues', api.leagues);

  const leagues = leagueData ?? [];
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null);

  const deleteLeague = async (league: LeagueSummary) => {
    if (
      !window.confirm(
        `Delete "${league.name}" and all of its season data? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingLeagueId(String(league.id));
    setError('');

    try {
      await api.deleteLeague(league.id);

      setLeagues(current =>
        (Array.isArray(current) ? current : []).filter(
          item => String(item.id) !== String(league.id),
        ),
      );

      refresh();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setDeletingLeagueId(null);
    }
  };

  return (
    <PageMotion>
      <section className="hero">
        <div className="hero-copy">
          <h1>
            Build a league.
            <br />
            <em>Run the season.</em>
          </h1>
          <p>
            Create your clubs, simulate fixtures and follow every result,
            match report and player statistic.
          </p>
          <Link to="/leagues/new" className="button button-primary">
            Create a league <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="hero-art">
          <img
            className="hero-photo"
            src="/matchday/fans.jpg"
            alt="Football fans in a stadium"
          />
        </div>
      </section>

      <section className="league-section" id="leagues">
        <div className="section-heading league-section-heading">
          <div>
            <span className="league-section-kicker">YOUR COMPETITIONS</span>
            <h2>
              Your leagues{' '}
              <span className="heading-count">
                {String(leagues.length).padStart(2, '0')}
              </span>
            </h2>
          </div>

          <Link to="/leagues/new" className="league-create-link">
            <span aria-hidden="true">+</span> New league
          </Link>
        </div>

        {error && <ErrorNotice message={error} onRetry={refresh} />}

        {loading ? (
          <Loading label="Finding your leagues" />
        ) : leagues.length ? (
          <div className="league-grid">
            {leagues.map((league, index) => {
              const progress = league.total_matches
                ? Math.min(
                    100,
                    (league.played_matches / league.total_matches) * 100,
                  )
                : 0;

              const isDeleting =
                deletingLeagueId === String(league.id);

              return (
                <article className="league-card" key={league.id}>
                  <Link
                    to={`/leagues/${league.id}`}
                    className="league-card-link"
                    aria-label={`Open ${league.name}, season ${league.season_label}`}
                  >
                    <div
                      className={`league-card-art league-card-art--${index % 3}`}
                    >
                      <div className="league-card-art-top">
                        <span className="season-stamp">
                          {league.season_label}
                        </span>
                        <span className="card-index">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="mini-pitch" aria-hidden="true">
                        <span />
                      </div>

                      <span className="league-art-caption">
                        SEASON OVERVIEW
                      </span>
                    </div>

                    <div className="league-card-body">
                      <div className="league-card-title">
                        <h3>{league.name}</h3>
                        <span
                          className="league-open-arrow"
                          aria-hidden="true"
                        >
                          ↗
                        </span>
                      </div>

                      <div className="league-card-metrics">
                        <div>
                          <strong>{league.club_count}</strong>
                          <span>Clubs</span>
                        </div>

                        <span className="league-metric-divider" />

                        <div>
                          <strong>{league.total_matches}</strong>
                          <span>Fixtures</span>
                        </div>

                        <span className="league-metric-divider" />

                        <div>
                          <strong>{league.played_matches}</strong>
                          <span>Played</span>
                        </div>
                      </div>

                      <div className="league-progress-heading">
                        <span>Season progress</span>
                        <strong>{Math.round(progress)}%</strong>
                      </div>

                      <div
                        className="league-progress"
                        role="progressbar"
                        aria-label={`${league.name} season progress`}
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ width: `${progress}%` }} />
                      </div>


                    </div>
                  </Link>

                  <div className="league-card-actions">
                    <button
                      type="button"
                      className="league-delete-button"
                      disabled={deletingLeagueId !== null}
                      onClick={() => void deleteLeague(league)}
                      aria-label={`Delete ${league.name}`}
                    >
                      {isDeleting ? (
                        'Deleting…'
                      ) : (
                        <>
                          <span aria-hidden="true">⌫</span>
                          Delete league
                        </>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3>A blank page. A whole season.</h3>
            <p>Your first league is one decision away.</p>
            <Link to="/leagues/new" className="button button-secondary">
              Create your first league
            </Link>
          </div>
        )}
      </section>
    </PageMotion>
  );
}
