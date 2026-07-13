import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { followSeller, getPublicUserProfile, listPublicUserReviews, unfollowSeller, type PublicReview, type PublicUserProfile } from "../api/users";
import { formatLocalDateTime, formatMoney, formatRemainingTime } from "../utils/format";

function Stars({ value }: { value: number | null }) {
  const rounded = value ? Math.round(value) : 0;
  return <span className="star-rating" aria-label={value ? `${value} csillag` : "Nincs értékelés"}>{Array.from({ length: 5 }).map((_, index) => <span key={index}>{index < rounded ? "★" : "☆"}</span>)}</span>;
}

function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) {
    return <p className="empty-state">Még nincs publikus értékelés.</p>;
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
          {review.comment ? <p>{review.comment}</p> : <p className="empty-state">Szöveges értékelés nélkül.</p>}
        </article>
      ))}
    </div>
  );
}

export function UserProfilePage() {
  const { username } = useParams();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [reviewSort, setReviewSort] = useState("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [followMessage, setFollowMessage] = useState("");

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
        setFollowMessage("A követés megszűnt.");
      } else {
        await followSeller(profile.username);
        setProfile({ ...profile, is_followed: true });
        setFollowMessage("Eladó követve.");
      }
    } catch (err) {
      setFollowMessage(err instanceof Error ? err.message : "A követés módosítása nem sikerült.");
    }
  };

  if (isLoading) {
    return <section className="container page-shell"><div className="skeleton-card profile-skeleton" /></section>;
  }

  if (error || !profile) {
    return <section className="container page-shell"><div className="side-panel form-message">{error || "A profil nem található."}</div></section>;
  }

  const stats = profile.stats;

  return (
    <section className="container page-shell profile-page">
      <div className="profile-header side-panel">
        <div>
          <p className="eyebrow">Eladói profil</p>
          <h1>{profile.full_name}</h1>
          <p className="section-note">@{profile.username} · regisztrált: {formatLocalDateTime(profile.created_at)}</p>
          <div className="profile-rating"><Stars value={stats.average_rating} /><strong>{stats.average_rating ?? "Nincs"}</strong></div>
        </div>
        <button className="button button-primary" type="button" onClick={toggleFollow}>{profile.is_followed ? "Követés leállítása" : "Eladó követése"}</button>
      </div>
      {followMessage ? <p className="form-message">{followMessage}</p> : null}

      <div className="stats-grid">
        <div className="side-panel"><span>Aktív aukciók</span><strong>{stats.active_auctions}</strong></div>
        <div className="side-panel"><span>Lezárt aukciók</span><strong>{stats.closed_auctions}</strong></div>
        <div className="side-panel"><span>Sikeres eladások</span><strong>{stats.successful_sales}</strong></div>
        <div className="side-panel"><span>Nyert aukciók</span><strong>{stats.won_auctions}</strong></div>
        <div className="side-panel"><span>Összes licit</span><strong>{stats.total_bids}</strong></div>
        <div className="side-panel"><span>Pozitív / negatív</span><strong>{stats.positive_reviews} / {stats.negative_reviews}</strong></div>
      </div>

      <section className="account-section">
        <div className="section-heading"><h2>Aktív aukciók</h2></div>
        {profile.active_auctions.length === 0 ? <div className="side-panel empty-state">Nincs aktív aukció.</div> : (
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
        <div className="section-heading"><h2>Lezárt aukciók</h2></div>
        {profile.closed_auctions.length === 0 ? <div className="side-panel empty-state">Nincs lezárt aukció.</div> : (
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
          <h2>Értékelések</h2>
          <select className="compact-select" value={reviewSort} onChange={(event) => setReviewSort(event.target.value)}>
            <option value="newest">Legújabb</option>
            <option value="oldest">Legrégebbi</option>
            <option value="rating_high">Legjobb értékelések</option>
            <option value="rating_low">Legalacsonyabb értékelések</option>
          </select>
        </div>
        <ReviewList reviews={reviews} />
      </section>
    </section>
  );
}
