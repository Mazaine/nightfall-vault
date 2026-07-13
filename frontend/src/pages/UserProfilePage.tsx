import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { blockUser, unblockUser } from "../api/blocks";
import { createUserReport, userReportReasons } from "../api/reports";
import { followSeller, getPublicUserProfile, listPublicUserReviews, unfollowSeller, type PublicReview, type PublicUserProfile } from "../api/users";
import { useAuth } from "../AuthContext";
import { ReportDialog } from "../components/ReportDialog";
import { formatLocalDateTime, formatMoney, formatRemainingTime } from "../utils/format";

function Stars({ value }: { value: number | null }) {
  const rounded = value ? Math.round(value) : 0;
  return <span className="star-rating" aria-label={value ? `${value} csillag` : "Nincs ertekeles"}>{Array.from({ length: 5 }).map((_, index) => <span key={index}>{index < rounded ? "★" : "☆"}</span>)}</span>;
}

function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) {
    return <p className="empty-state">Meg nincs publikus ertekeles.</p>;
  }
  return (
    <div className="review-list">
      {reviews.map((review) => (
        <article className="review-row" key={review.id}>
          <div>
            <strong>{review.reviewer_username}</strong>
            <span>{formatLocalDateTime(review.created_at)}</span>
          </div>
          <Stars value={review.rating} />
          <Link className="text-link" to={`/auctions/${review.auction_id}`}>{review.auction_title}</Link>
          {review.comment ? <p>{review.comment}</p> : <p className="empty-state">Szoveges ertekeles nelkul.</p>}
        </article>
      ))}
    </div>
  );
}

export function UserProfilePage() {
  const { username } = useParams();
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [reviewSort, setReviewSort] = useState("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [showReportDialog, setShowReportDialog] = useState(false);

  useEffect(() => {
    if (!username) return;
    setIsLoading(true);
    setError("");
    Promise.all([getPublicUserProfile(username), listPublicUserReviews(username, { sort: reviewSort, limit: 20 })])
      .then(([profileData, reviewPage]) => {
        setProfile(profileData);
        setReviews(reviewPage.items);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [username, reviewSort]);

  const toggleFollow = async () => {
    if (!profile) return;
    try {
      if (profile.is_followed) {
        await unfollowSeller(profile.username);
        setProfile({ ...profile, is_followed: false });
        setActionMessage("A kovetes megszunt.");
      } else {
        await followSeller(profile.username);
        setProfile({ ...profile, is_followed: true });
        setActionMessage("Elado kovetve.");
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "A kovetes modositasa nem sikerult.");
    }
  };

  const toggleBlock = async () => {
    if (!profile) return;
    try {
      if (profile.is_blocked) {
        await unblockUser(profile.username);
        setProfile({ ...profile, is_blocked: false });
        setActionMessage("Blokkolas feloldva.");
      } else {
        await blockUser(profile.username);
        setProfile({ ...profile, is_blocked: true, is_followed: false });
        setActionMessage("Felhasznalo blokkolva. A kommunikacio es kovetes tiltva.");
      }
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "A blokkolas modositasa nem sikerult.");
    }
  };

  if (isLoading) {
    return <section className="container page-shell"><div className="skeleton-card profile-skeleton" /></section>;
  }

  if (error || !profile) {
    return <section className="container page-shell"><div className="side-panel form-message">{error || "A profil nem talalhato."}</div></section>;
  }

  const stats = profile.stats;
  const isOwnProfile = user?.username === profile.username;
  const canUseTrustActions = isAuthenticated && !isOwnProfile;

  return (
    <section className="container page-shell profile-page">
      <div className="profile-header side-panel">
        <div>
          <p className="eyebrow">Eladoi profil</p>
          <h1>{profile.full_name}</h1>
          <p className="section-note">@{profile.username} · regisztralt: {formatLocalDateTime(profile.created_at)}</p>
          <div className="profile-rating"><Stars value={stats.average_rating} /><strong>{stats.average_rating ?? "Nincs"}</strong></div>
        </div>
        {canUseTrustActions ? (
          <div className="profile-actions">
            <button className="button button-primary" type="button" onClick={toggleFollow} disabled={profile.is_blocked || profile.is_blocked_by_user}>{profile.is_followed ? "Kovetes leallitasa" : "Elado kovetese"}</button>
            <button className="button button-secondary" type="button" onClick={toggleBlock}>{profile.is_blocked ? "Blokkolas feloldasa" : "Felhasznalo blokkolasa"}</button>
            <button className="button button-ghost" type="button" onClick={() => setShowReportDialog(true)}>Profil jelentese</button>
          </div>
        ) : null}
      </div>
      {profile.is_blocked ? <p className="form-message">Blokkoltad ezt a felhasznalot. Uj uzenet es kovetes nem indithato.</p> : null}
      {profile.is_blocked_by_user ? <p className="form-message">Ez a felhasznalo blokkolt teged.</p> : null}
      {actionMessage ? <p className="form-message">{actionMessage}</p> : null}

      <div className="stats-grid">
        <div className="side-panel"><span>Követők</span><strong>{stats.follower_count}</strong></div>
        <div className="side-panel"><span>Követett eladók</span><strong>{stats.following_count}</strong></div>
        <div className="side-panel"><span>Aktiv aukciok</span><strong>{stats.active_auctions}</strong></div>
        <div className="side-panel"><span>Lezart aukciok</span><strong>{stats.closed_auctions}</strong></div>
        <div className="side-panel"><span>Sikeres eladasok</span><strong>{stats.successful_sales}</strong></div>
        <div className="side-panel"><span>Nyert aukciok</span><strong>{stats.won_auctions}</strong></div>
        <div className="side-panel"><span>Osszes licit</span><strong>{stats.total_bids}</strong></div>
        <div className="side-panel"><span>Sikeres licitek</span><strong>{stats.successful_bids}</strong></div>
        <div className="side-panel"><span>Elvesztett licitek</span><strong>{stats.lost_bids}</strong></div>
        <div className="side-panel"><span>Sikerességi arány</span><strong>{stats.success_rate}%</strong></div>
        <div className="side-panel"><span>Pozitiv / negativ</span><strong>{stats.positive_reviews} / {stats.negative_reviews}</strong></div>
      </div>

      <section className="account-section">
        <div className="section-heading"><h2>Aktiv aukciok</h2></div>
        {profile.active_auctions.length === 0 ? <div className="side-panel empty-state">Nincs aktiv aukcio.</div> : (
          <div className="compact-auction-list">
            {profile.active_auctions.map((auction) => (
              <Link className="compact-auction-row" to={`/auctions/${auction.id}`} key={auction.id}>
                <strong>{auction.title}</strong>
                <span>{auction.category}</span>
                <span>{formatMoney(auction.current_price)}</span>
                <span>{auction.bid_count} licit · {formatRemainingTime(auction.ends_at, auction.status)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="account-section">
        <div className="section-heading"><h2>Lezart aukciok</h2></div>
        {profile.closed_auctions.length === 0 ? <div className="side-panel empty-state">Nincs lezart aukcio.</div> : (
          <div className="compact-auction-list">
            {profile.closed_auctions.map((auction) => (
              <Link className="compact-auction-row is-closed" to={`/auctions/${auction.id}`} key={auction.id}>
                <strong>{auction.title}</strong>
                <span>{auction.status}</span>
                <span>{formatMoney(auction.current_price)}</span>
                <span>{auction.bid_count} licit</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="account-section">
        <div className="section-heading">
          <h2>Ertekelesek</h2>
          <select className="compact-select" value={reviewSort} onChange={(event) => setReviewSort(event.target.value)}>
            <option value="newest">Legujabb</option>
            <option value="oldest">Legregebbi</option>
            <option value="rating_high">Legjobb ertekelesek</option>
            <option value="rating_low">Legalacsonyabb ertekelesek</option>
          </select>
        </div>
        <ReviewList reviews={reviews} />
      </section>

      {showReportDialog ? (
        <ReportDialog
          title="Profil jelentese"
          targetLabel={profile.username}
          reasons={userReportReasons}
          onClose={() => setShowReportDialog(false)}
          onSubmit={(reason, details) => createUserReport(profile.username, reason, details).then(() => undefined)}
        />
      ) : null}
    </section>
  );
}
