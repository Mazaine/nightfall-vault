# 🗄️ Nightfall Vault – Adatbázis tervezés

## Cél

A dokumentum célja a Nightfall Vault adatbázisának megtervezése.

Ebben a fázisban még nem készül SQL vagy ORM implementáció, kizárólag az üzleti modell kerül meghatározásra.

---

# Tervezési alapelvek

Az adatbázis legyen:

* normalizált
* könnyen bővíthető
* jól indexelhető
* biztonságos
* naplózható
* skálázható

Minden rekord rendelkezzen:

* egyedi azonosítóval (UUID)
* létrehozási idővel
* módosítási idővel
* opcionálisan törlési idővel (soft delete)

---

# Fő entitások

## Felhasználók

Tárolja a rendszer felhasználóit.

Főbb adatok:

* UUID
* felhasználónév
* e-mail cím
* jelszó hash
* profilkép
* szerepkör
* státusz
* nyelv
* időzóna
* utolsó belépés

Kapcsolatok:

* aukciók
* licitek
* értesítések
* kedvencek
* figyelőlista

---

## Szerepkörök

Lehetséges szerepkörök:

* User
* Moderator
* Admin
* Super Admin

---

## Aukciók

Egy aukció minden információja.

Főbb mezők:

* UUID
* cím
* leírás
* kategória
* kezdőár
* minimális licitlépcső
* aktuális ár
* villámár (opcionális)
* indulási idő
* zárási idő
* státusz
* tulajdonos

Kapcsolatok:

* licitek
* képek
* kategóriák
* címkék

---

## Licitek

Minden licit külön rekord.

Főbb mezők:

* UUID
* aukció
* licitáló
* összeg
* időpont

---

## Kategóriák

Hierarchikus kategóriarendszer.

Példa:

Gyűjtemények

* Kártyajátékok
* Érmék
* Képregények

Elektronika

* Konzolok
* Laptopok

---

## Képek

Egy aukció több képpel is rendelkezhet.

Adatok:

* UUID
* fájlnév
* tárolási útvonal
* sorrend
* borítókép jelölése

---

## Kedvencek

Felhasználók által mentett aukciók.

---

## Figyelőlista

A felhasználó automatikusan értesítést kap a figyelt aukciókról.

---

## Értesítések

Lehetséges események:

* túllicitálták
* aukció lezárult
* aukció indul
* villámár megvásárolva
* rendszerüzenet

---

## Üzenetek (későbbi funkció)

Belső kommunikáció.

---

## Jelentések

Felhasználók vagy aukciók jelentése.

---

## Napló

Adminisztrációs események.

Például:

* bejelentkezés
* jogosultság módosítás
* aukció törlése
* tiltás

---

# Kapcsolatok

Felhasználó

↓

több aukció

↓

egy aukció

↓

több licit

↓

egy licit

↓

egy felhasználó

---

Felhasználó

↓

több kedvenc

↓

több aukció

---

Felhasználó

↓

több értesítés

---

# Állapotok

## Aukció

* Draft
* Scheduled
* Active
* Finished
* Cancelled
* Archived

---

## Felhasználó

* Active
* Pending
* Suspended
* Deleted

---

# Soft Delete

Az üzleti adatok lehetőség szerint ne kerüljenek azonnali fizikai törlésre.

A rekordok archiválhatók vagy soft delete állapotba helyezhetők.

---

# Indexelés

Várható indexek:

Felhasználó

* e-mail
* felhasználónév

Aukció

* státusz
* kategória
* zárási idő
* tulajdonos

Licit

* aukció
* licitáló

Értesítések

* felhasználó
* olvasott állapot

---

# Naplózás

Fontos események:

* bejelentkezések
* sikertelen belépések
* licitek
* admin műveletek
* jogosultság változások

---

# Jövőbeni bővítések

* Token rendszer
* VIP tagság
* Fizetések
* Számlázás
* Kuponok
* Promóciók
* Valós idejű WebSocket események
* Mobilalkalmazás támogatása
* Külső API

---

# Tervezési elvek

Az adatbázis minden új funkciónál az alábbi szempontok szerint bővíthető:

* visszafelé kompatibilis
* könnyen migrálható
* jól dokumentált
* teljesítményorientált
* biztonságos
* hosszú távon karbantartható
