import axios from "axios";
import { ChangeEvent, FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import {
  createAdminNewsletterCampaign,
  createAdminNewsletterSubscriber,
  deleteAdminNewsletterCampaign,
  deleteAdminNewsletterSubscriber,
  getAdminNewsletterCampaigns,
  getAdminNewsletterSubscribers,
  sendAdminNewsletterBulk,
  sendAdminNewsletterTest,
  updateAdminNewsletterCampaign,
} from "../../api/admin";
import { AdminLayout } from "../../components/AdminLayout";
import type {
  NewsletterCampaign,
  NewsletterCampaignPayload,
  NewsletterSubscriber,
} from "../../types";
import "./AdminNewslettersPage.css";

type AdminNewslettersPageProps = {
  cartCount: number;
};

type CampaignForm = {
  title: string;
  subject: string;
  contentHtml: string;
  contentText: string;
};

type SubscriberStatusFilter = "active" | "inactive" | "all";

const emptyForm: CampaignForm = {
  title: "",
  subject: "",
  contentHtml: "",
  contentText: "",
};

const pageSize = 25;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return fallback;
}

function sanitizeNewsletterPreviewHtml(html: string) {
  if (!html.trim()) {
    return "<p>Nincs tartalom.</p>";
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  document.querySelectorAll("script, style, iframe, object, embed").forEach((element) => element.remove());
  document.body.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim().toLowerCase();
      if (attributeName.startsWith("on") || attributeValue.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return document.body.innerHTML;
}

export function AdminNewslettersPage({ cartCount }: AdminNewslettersPageProps) {
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [subscriberName, setSubscriberName] = useState("");
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriberStatusFilter, setSubscriberStatusFilter] = useState<SubscriberStatusFilter>("active");
  const [selectedSubscriberIds, setSelectedSubscriberIds] = useState<number[]>([]);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    getAdminNewsletterCampaigns().then(setCampaigns).catch(() => setError("A kampánylista nem elérhető."));
    getAdminNewsletterSubscribers().then(setSubscribers).catch(() => setError("A feliratkozók listája nem elérhető."));
  }

  const filteredSubscribers = useMemo(() => {
    const search = subscriberSearch.trim().toLowerCase();
    return subscribers.filter((subscriber) => {
      if (subscriberStatusFilter === "active" && !subscriber.is_active) {
        return false;
      }
      if (subscriberStatusFilter === "inactive" && subscriber.is_active) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [subscriber.email, subscriber.full_name ?? "", subscriber.source].some((value) =>
        value.toLowerCase().includes(search),
      );
    });
  }, [subscriberSearch, subscriberStatusFilter, subscribers]);

  const totalPages = Math.max(1, Math.ceil(filteredSubscribers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedSubscribers = filteredSubscribers.slice(pageStartIndex, pageStartIndex + pageSize);
  const activeFilteredSubscribers = filteredSubscribers.filter((subscriber) => subscriber.is_active);
  const selectedActiveSubscriberIds = selectedSubscriberIds.filter((id) =>
    subscribers.some((subscriber) => subscriber.id === id && subscriber.is_active),
  );
  const selectedActiveCount = selectedActiveSubscriberIds.length;
  const arePageActiveSubscribersSelected = paginatedSubscribers
    .filter((subscriber) => subscriber.is_active)
    .every((subscriber) => selectedSubscriberIds.includes(subscriber.id));

  function buildPayload(): NewsletterCampaignPayload {
    return {
      title: form.title,
      subject: form.subject,
      content_html: form.contentHtml,
      content_text: form.contentText || null,
      status: "draft",
    };
  }

  function loadCampaignIntoEditor(campaign: NewsletterCampaign, message = "Kampány betöltve szerkesztésre.") {
    setEditingId(campaign.id);
    setForm({
      title: campaign.title,
      subject: campaign.subject,
      contentHtml: campaign.content_html,
      contentText: campaign.content_text ?? "",
    });
    setSendStatus(message);
    setError(null);
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const saved =
        editingId === null
          ? await createAdminNewsletterCampaign(buildPayload())
          : await updateAdminNewsletterCampaign(editingId, buildPayload());
      setCampaigns((current) => {
        const exists = current.some((campaign) => campaign.id === saved.id);
        return exists
          ? current.map((campaign) => (campaign.id === saved.id ? saved : campaign))
          : [saved, ...current];
      });
      setEditingId(saved.id);
      setSendStatus("A kampány mentése sikeres.");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "A kampány mentése nem sikerült."));
    }
  }

  async function sendTest() {
    if (editingId === null) {
      setError("Előbb mentsd vagy válaszd ki a kampányt.");
      return;
    }
    try {
      const updated = await sendAdminNewsletterTest(editingId, testEmail);
      setCampaigns((current) => current.map((campaign) => (campaign.id === updated.id ? updated : campaign)));
      setSendStatus("A teszt e-mail küldése feldolgozásra került.");
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "A teszt e-mail nem ment ki. Nézd meg a backend logot."));
    }
  }

  async function sendToSelected(campaignId = editingId) {
    if (campaignId === null) {
      setError("Előbb mentsd vagy válaszd ki a kampányt.");
      return;
    }
    if (selectedActiveSubscriberIds.length === 0) {
      setError("Nincs kijelölt aktív hírlevél-feliratkozó.");
      return;
    }
    try {
      const response = await sendAdminNewsletterBulk(campaignId, {
        subscriber_ids: selectedActiveSubscriberIds,
        send_to_all: false,
      });
      setSendStatus(`${response.message} Sikeres: ${response.sent_count}, sikertelen: ${response.failed_count}.`);
      loadData();
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "A kijelölteknek küldés nem sikerült."));
    }
  }

  async function sendToAll(campaignId = editingId) {
    if (campaignId === null) {
      setError("Előbb mentsd vagy válaszd ki a kampányt.");
      return;
    }
    try {
      const response = await sendAdminNewsletterBulk(campaignId, { send_to_all: true });
      setSendStatus(`${response.message} Sikeres: ${response.sent_count}, sikertelen: ${response.failed_count}.`);
      loadData();
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Az összes aktív feliratkozónak küldés nem sikerült."));
    }
  }

  function toggleSubscriberSelection(subscriber: NewsletterSubscriber, index: number, event: MouseEvent<HTMLInputElement>) {
    if (!subscriber.is_active) {
      return;
    }

    const visibleActiveSubscribers = paginatedSubscribers.filter((item) => item.is_active);
    const activeIndex = visibleActiveSubscribers.findIndex((item) => item.id === subscriber.id);
    if (event.shiftKey && lastClickedIndex !== null && activeIndex >= 0) {
      const start = Math.min(lastClickedIndex, activeIndex);
      const end = Math.max(lastClickedIndex, activeIndex);
      const rangeIds = visibleActiveSubscribers.slice(start, end + 1).map((item) => item.id);
      setSelectedSubscriberIds((current) => Array.from(new Set([...current, ...rangeIds])));
    } else {
      setSelectedSubscriberIds((current) =>
        current.includes(subscriber.id)
          ? current.filter((id) => id !== subscriber.id)
          : [...current, subscriber.id],
      );
    }

    if (activeIndex >= 0) {
      setLastClickedIndex(activeIndex);
    } else {
      setLastClickedIndex(index);
    }
  }

  function toggleSelectAllPage(event: ChangeEvent<HTMLInputElement>) {
    const pageActiveIds = paginatedSubscribers.filter((subscriber) => subscriber.is_active).map((subscriber) => subscriber.id);
    if (event.target.checked) {
      setSelectedSubscriberIds((current) => Array.from(new Set([...current, ...pageActiveIds])));
      return;
    }
    setSelectedSubscriberIds((current) => current.filter((id) => !pageActiveIds.includes(id)));
  }

  function selectAllFilteredSubscribers() {
    setSelectedSubscriberIds(activeFilteredSubscribers.map((subscriber) => subscriber.id));
  }

  async function addSubscriber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await createAdminNewsletterSubscriber({
        email: subscriberEmail,
        full_name: subscriberName || null,
        is_active: true,
        source: "manual",
      });
      setSubscribers((current) => [created, ...current]);
      setSubscriberEmail("");
      setSubscriberName("");
      setSendStatus("A feliratkozó mentése sikeres.");
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "A feliratkozó mentése nem sikerült."));
    }
  }

  async function deleteCampaign(campaignId: number) {
    try {
      await deleteAdminNewsletterCampaign(campaignId);
      setCampaigns((current) => current.filter((item) => item.id !== campaignId));
      if (editingId === campaignId) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setSendStatus("A kampány törlése sikeres.");
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "A kampány törlése nem sikerült."));
    }
  }

  async function unsubscribeSubscriber(subscriberId: number) {
    try {
      await deleteAdminNewsletterSubscriber(subscriberId);
      await getAdminNewsletterSubscribers().then(setSubscribers);
      setSelectedSubscriberIds((current) => current.filter((id) => id !== subscriberId));
      setSendStatus("A feliratkozó leiratkoztatása sikeres.");
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "A feliratkozó leiratkoztatása nem sikerült."));
    }
  }

  useEffect(() => {
    setCurrentPage(1);
    setLastClickedIndex(null);
  }, [subscriberSearch, subscriberStatusFilter]);

  return (
    <AdminLayout cartCount={cartCount}>
      <section className="admin-newsletters-page">
        <div className="admin-hero">
          <p className="eyebrow">Admin</p>
          <h1>Hírlevelek</h1>
          <p className="lead">Kampányok szerkesztése, előnézete és célzott hírlevélküldés feliratkozóknak.</p>
        </div>

        {error ? <div className="admin-error">{error}</div> : null}
        {sendStatus ? <div className="newsletter-send-status">{sendStatus}</div> : null}

        <div className="newsletter-workspace">
          <form className="newsletter-editor" onSubmit={saveCampaign}>
            <h2>{editingId ? "Kampány szerkesztése" : "Új kampány"}</h2>
            <label>
              <span>Kampány neve</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </label>
            <label>
              <span>Tárgy</span>
              <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
            </label>
            <label>
              <span>HTML szerkesztő</span>
              <textarea value={form.contentHtml} onChange={(event) => setForm({ ...form, contentHtml: event.target.value })} required />
            </label>
            <label>
              <span>Szöveges tartalom opcionális</span>
              <textarea value={form.contentText} onChange={(event) => setForm({ ...form, contentText: event.target.value })} />
            </label>
            <button className="primary-action" type="submit">Mentés</button>
          </form>

          <div className="newsletter-preview-panel">
            <h2>Kampány előnézet</h2>
            <div
              className="newsletter-preview"
              dangerouslySetInnerHTML={{ __html: sanitizeNewsletterPreviewHtml(form.contentHtml) }}
            />
            <div className="newsletter-test-box">
              <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="Teszt e-mail cím" />
              <button type="button" onClick={sendTest}>Teszt e-mail küldése</button>
            </div>
          </div>
        </div>

        <section className="newsletter-campaign-list">
          <h2>Kampányok</h2>
          <div className="newsletter-campaign-scroll">
            {campaigns.map((campaign) => (
              <article key={campaign.id}>
                <div>
                  <strong>{campaign.title}</strong>
                  <span>{campaign.subject}</span>
                  <small>Létrehozva: {formatDate(campaign.created_at)}</small>
                </div>
                <button type="button" onClick={() => loadCampaignIntoEditor(campaign)}>Szerkesztés</button>
                <button type="button" onClick={() => loadCampaignIntoEditor(campaign, "Kampány betöltve előnézetre.")}>Előnézet</button>
                <button type="button" onClick={() => sendToSelected(campaign.id)}>Küldés</button>
                <button type="button" onClick={() => deleteCampaign(campaign.id)}>Törlés</button>
              </article>
            ))}
          </div>
        </section>

        <section className="newsletter-subscriber-list">
          <h2>Hírlevél címzettek</h2>

          <div className="newsletter-recipient-toolbar">
            <label className="newsletter-check-control">
              <input
                type="checkbox"
                checked={arePageActiveSubscribersSelected && paginatedSubscribers.some((subscriber) => subscriber.is_active)}
                onChange={toggleSelectAllPage}
              />
              Összes kijelölése
            </label>
            <input
              type="search"
              value={subscriberSearch}
              onChange={(event) => setSubscriberSearch(event.target.value)}
              placeholder="Keresés név vagy e-mail alapján"
            />
            <select value={subscriberStatusFilter} onChange={(event) => setSubscriberStatusFilter(event.target.value as SubscriberStatusFilter)}>
              <option value="active">Csak aktív</option>
              <option value="inactive">Csak leiratkozott</option>
              <option value="all">Összes</option>
            </select>
            <button type="button" onClick={selectAllFilteredSubscribers} disabled={activeFilteredSubscribers.length === 0}>
              Összes szűrt aktív kijelölése
            </button>
            <button type="button" onClick={() => setSelectedSubscriberIds([])}>Kijelölés törlése</button>
            <button type="button" onClick={() => sendToSelected()} disabled={selectedActiveCount === 0}>Kijelölteknek küldés</button>
            <button type="button" onClick={() => sendToAll()} disabled={!subscribers.some((subscriber) => subscriber.is_active)}>
              Minden aktív feliratkozónak
            </button>
          </div>

          <div className="newsletter-selected-summary">
            Kijelölve: <strong>{selectedActiveCount}</strong> feliratkozó
          </div>

          <form className="newsletter-subscriber-form" onSubmit={addSubscriber}>
            <input type="email" value={subscriberEmail} onChange={(event) => setSubscriberEmail(event.target.value)} placeholder="Új feliratkozó e-mail" required />
            <input value={subscriberName} onChange={(event) => setSubscriberName(event.target.value)} placeholder="Név" />
            <button type="submit">Feliratkozó mentése</button>
          </form>

          <div className="newsletter-table-wrap">
            <table className="newsletter-recipient-table">
              <thead>
                <tr>
                  <th aria-label="Kijelölés" />
                  <th>Név</th>
                  <th>E-mail</th>
                  <th>Feliratkozva</th>
                  <th>Állapot</th>
                  <th>Művelet</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Nincs a szűrésnek megfelelő feliratkozó.</td>
                  </tr>
                ) : (
                  paginatedSubscribers.map((subscriber, index) => (
                    <tr key={subscriber.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedSubscriberIds.includes(subscriber.id)}
                          disabled={!subscriber.is_active}
                          onClick={(event) => toggleSubscriberSelection(subscriber, index, event)}
                          readOnly
                        />
                      </td>
                      <td>{subscriber.full_name ?? "-"}</td>
                      <td>{subscriber.email}</td>
                      <td>{formatDate(subscriber.created_at)}</td>
                      <td>
                        <span className={subscriber.is_active ? "newsletter-status active" : "newsletter-status inactive"}>
                          {subscriber.is_active ? "Aktív" : "Leiratkozott"}
                        </span>
                      </td>
                      <td>
                        {subscriber.is_active ? (
                          <button type="button" onClick={() => unsubscribeSubscriber(subscriber.id)}>Leiratkoztatás</button>
                        ) : (
                          <span className="newsletter-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="newsletter-pagination">
            <button type="button" disabled={safeCurrentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
              Előző
            </button>
            <span>
              {safeCurrentPage} / {totalPages}
            </span>
            <button type="button" disabled={safeCurrentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
              Következő
            </button>
          </div>
        </section>
      </section>
    </AdminLayout>
  );
}
