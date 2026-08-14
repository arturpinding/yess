import "dotenv/config";

import { sql } from "drizzle-orm";
import { closeDatabase, db } from "../src/server/db/client";
import {
  DEMO_ATHLETE_IDS,
  DEMO_COMPETITION_IDS,
  DEMO_EVENT_IDS,
  DEMO_PROFILE_ID,
  DEMO_SPORT_IDS,
  DEMO_TEAM_IDS,
  DEMO_USER_ID,
} from "../src/server/db/demo-ids";
import * as tables from "../src/server/db/schema";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function minutesFrom(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * MINUTE);
}

function daysFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY);
}

const ids = {
  season: {
    winter: "51000000-0000-4000-8000-000000000001",
    basketball: "51000000-0000-4000-8000-000000000002",
    athletics: "51000000-0000-4000-8000-000000000003",
    rowing: "51000000-0000-4000-8000-000000000004",
    volleyball: "51000000-0000-4000-8000-000000000005",
  },
  venue: {
    winter: "60000000-0000-4000-8000-000000000001",
    arena: "60000000-0000-4000-8000-000000000002",
    stadium: "60000000-0000-4000-8000-000000000003",
    boathouse: "60000000-0000-4000-8000-000000000004",
    hall: "60000000-0000-4000-8000-000000000005",
  },
  participant: {
    liveMari: "71000000-0000-4000-8000-000000000001",
    liveAino: "71000000-0000-4000-8000-000000000002",
    basketballHome: "71000000-0000-4000-8000-000000000003",
    basketballAway: "71000000-0000-4000-8000-000000000004",
    basketballKarl: "71000000-0000-4000-8000-000000000005",
    athleticsLiis: "71000000-0000-4000-8000-000000000006",
    athleticsMarta: "71000000-0000-4000-8000-000000000007",
    rowingAnu: "71000000-0000-4000-8000-000000000008",
    rowingSofia: "71000000-0000-4000-8000-000000000009",
    volleyballHome: "71000000-0000-4000-8000-000000000010",
    volleyballAway: "71000000-0000-4000-8000-000000000011",
    volleyballRasmus: "71000000-0000-4000-8000-000000000012",
    cancelledHome: "71000000-0000-4000-8000-000000000013",
    cancelledAway: "71000000-0000-4000-8000-000000000014",
  },
  product: {
    monthly: "80000000-0000-4000-8000-000000000001",
    eventPass: "80000000-0000-4000-8000-000000000002",
  },
  subscription: "81000000-0000-4000-8000-000000000001",
  entitlement: "82000000-0000-4000-8000-000000000001",
  media: {
    replay: "90000000-0000-4000-8000-000000000001",
    highlight: "90000000-0000-4000-8000-000000000002",
    poster: "90000000-0000-4000-8000-000000000003",
  },
  stream: {
    live: "91000000-0000-4000-8000-000000000001",
    basketball: "91000000-0000-4000-8000-000000000002",
    replay: "91000000-0000-4000-8000-000000000003",
    delayed: "91000000-0000-4000-8000-000000000004",
  },
  rights: {
    live: "a0000000-0000-4000-8000-000000000001",
    basketball: "a0000000-0000-4000-8000-000000000002",
    athletics: "a0000000-0000-4000-8000-000000000003",
    replay: "a0000000-0000-4000-8000-000000000004",
    delayed: "a0000000-0000-4000-8000-000000000005",
  },
  follow: {
    athlete: "b0000000-0000-4000-8000-000000000001",
    team: "b0000000-0000-4000-8000-000000000002",
    sport: "b0000000-0000-4000-8000-000000000003",
    competition: "b0000000-0000-4000-8000-000000000004",
  },
  preference: {
    starting: "b1000000-0000-4000-8000-000000000001",
    highlight: "b1000000-0000-4000-8000-000000000002",
    athlete: "b1000000-0000-4000-8000-000000000003",
  },
  notification: {
    starting: "b2000000-0000-4000-8000-000000000001",
    highlight: "b2000000-0000-4000-8000-000000000002",
  },
  result: {
    anu: "c0000000-0000-4000-8000-000000000001",
    sofia: "c0000000-0000-4000-8000-000000000002",
  },
  timeline: {
    liveStart: "c1000000-0000-4000-8000-000000000001",
    liveUpdate: "c1000000-0000-4000-8000-000000000002",
    replayFinish: "c1000000-0000-4000-8000-000000000003",
  },
  highlight: "c2000000-0000-4000-8000-000000000001",
  collection: "d0000000-0000-4000-8000-000000000001",
  source: "e0000000-0000-4000-8000-000000000001",
  sourceRecord: {
    live: "e1000000-0000-4000-8000-000000000001",
    basketball: "e1000000-0000-4000-8000-000000000002",
  },
  audit: "f0000000-0000-4000-8000-000000000001",
  outbox: "f1000000-0000-4000-8000-000000000001",
} as const;

async function seed(): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(tables.users)
      .values({
        id: DEMO_USER_ID,
        email: "demo@rada.local",
        displayName: "RADA demo kasutaja",
        role: "viewer",
        state: "active",
        preferredLocale: "et",
        timezone: "Europe/Tallinn",
        emailVerifiedAt: now,
        consentVersion: "demo-no-production-consent",
      })
      .onConflictDoNothing();

    await tx
      .insert(tables.profiles)
      .values({
        id: DEMO_PROFILE_ID,
        userId: DEMO_USER_ID,
        name: "Mari",
        kind: "adult",
        avatarKey: "demo-mari",
        locale: "et",
        spoilerFree: false,
        dataSaver: false,
      })
      .onConflictDoNothing();

    await tx
      .insert(tables.sports)
      .values([
        {
          id: DEMO_SPORT_IDS.basketball,
          slug: "korvpall",
          nameEt: "Korvpall",
          nameEn: "Basketball",
          iconKey: "basketball",
          isFeatured: true,
        },
        {
          id: DEMO_SPORT_IDS.biathlon,
          slug: "laskesuusatamine",
          nameEt: "Laskesuusatamine",
          nameEn: "Biathlon",
          iconKey: "biathlon",
          isFeatured: true,
        },
        {
          id: DEMO_SPORT_IDS.athletics,
          slug: "kergejoustik",
          nameEt: "Kergejõustik",
          nameEn: "Athletics",
          iconKey: "athletics",
          isFeatured: true,
        },
        {
          id: DEMO_SPORT_IDS.rowing,
          slug: "soudmine",
          nameEt: "Sõudmine",
          nameEn: "Rowing",
          iconKey: "rowing",
          isFeatured: false,
        },
        {
          id: DEMO_SPORT_IDS.volleyball,
          slug: "vorkpall",
          nameEt: "Võrkpall",
          nameEn: "Volleyball",
          iconKey: "volleyball",
          isFeatured: true,
        },
        {
          id: DEMO_SPORT_IDS.football,
          slug: "jalgpall",
          nameEt: "Jalgpall",
          nameEn: "Football",
          iconKey: "football",
          isFeatured: true,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tables.teams)
      .values([
        {
          id: DEMO_TEAM_IDS.tartuTorm,
          sportId: DEMO_SPORT_IDS.basketball,
          slug: "tartu-torm-demo",
          name: "Tartu Torm (demo)",
          shortName: "TORM",
          countryCode: "EE",
          city: "Tartu",
          isDemo: true,
        },
        {
          id: DEMO_TEAM_IDS.rheinburg,
          sportId: DEMO_SPORT_IDS.basketball,
          slug: "rheinburg-bc-demo",
          name: "Rheinburg BC (demo)",
          shortName: "RBC",
          countryCode: "DE",
          city: "Rheinburg",
          isDemo: true,
        },
        {
          id: DEMO_TEAM_IDS.nordhavn,
          sportId: DEMO_SPORT_IDS.biathlon,
          slug: "nordhavn-skiklubb-demo",
          name: "Nordhavn Skiklubb (demo)",
          shortName: "NSK",
          countryCode: "NO",
          city: "Nordhavn",
          isDemo: true,
        },
        {
          id: DEMO_TEAM_IDS.tallinnLaine,
          sportId: DEMO_SPORT_IDS.volleyball,
          slug: "tallinn-laine-demo",
          name: "Tallinn Laine (demo)",
          shortName: "LAINE",
          countryCode: "EE",
          city: "Tallinn",
          isDemo: true,
        },
        {
          id: DEMO_TEAM_IDS.rigaVektors,
          sportId: DEMO_SPORT_IDS.volleyball,
          slug: "riga-vektors-demo",
          name: "Rīga Vektors (demo)",
          shortName: "VEK",
          countryCode: "LV",
          city: "Rīga",
          isDemo: true,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tables.athletes)
      .values([
        {
          id: DEMO_ATHLETE_IDS.mariMets,
          primarySportId: DEMO_SPORT_IDS.biathlon,
          slug: "mari-mets-demo",
          givenName: "Mari",
          familyName: "Mets",
          displayName: "Mari Mets",
          nationalityCode: "EE",
          birthDate: new Date("1998-02-14T00:00:00.000Z"),
          portraitUrl: "/athletes/demo/mari-mets.svg",
          biographyEt:
            "Väljamõeldud Eesti laskesuusataja, kes treenib Norra demoklubis. Profiil on loodud RADA funktsioonide näitamiseks.",
          biographyEn:
            "A fictional Estonian biathlete training with a demo club in Norway. This profile exists to demonstrate RADA features.",
          keyFacts: [
            { labelEt: "Kodulinn", labelEn: "Hometown", value: "Võru" },
            { labelEt: "Demohooaeg", labelEn: "Demo season", value: "2 poodiumit" },
          ],
          isDemo: true,
        },
        {
          id: DEMO_ATHLETE_IDS.ainoLaine,
          primarySportId: DEMO_SPORT_IDS.biathlon,
          slug: "aino-laine-demo",
          givenName: "Aino",
          familyName: "Laine",
          displayName: "Aino Laine",
          nationalityCode: "FI",
          birthDate: new Date("1997-11-02T00:00:00.000Z"),
          portraitUrl: "/athletes/demo/aino-laine.svg",
          biographyEt: "Väljamõeldud Soome laskesuusataja RADA demovõistlusel.",
          biographyEn: "A fictional Finnish biathlete in a RADA demo competition.",
          isDemo: true,
        },
        {
          id: DEMO_ATHLETE_IDS.karlKask,
          primarySportId: DEMO_SPORT_IDS.basketball,
          slug: "karl-kask-demo",
          givenName: "Karl",
          familyName: "Kask",
          displayName: "Karl Kask",
          nationalityCode: "EE",
          birthDate: new Date("2000-07-21T00:00:00.000Z"),
          portraitUrl: "/athletes/demo/karl-kask.svg",
          biographyEt:
            "Väljamõeldud Eesti tagamängija, kes mängib Saksamaa demoklubis Rheinburg BC.",
          biographyEn: "A fictional Estonian guard playing for the German demo club Rheinburg BC.",
          keyFacts: [{ labelEt: "Positsioon", labelEn: "Position", value: "Tagamängija / Guard" }],
          isDemo: true,
        },
        {
          id: DEMO_ATHLETE_IDS.liisTamm,
          primarySportId: DEMO_SPORT_IDS.athletics,
          slug: "liis-tamm-demo",
          givenName: "Liis",
          familyName: "Tamm",
          displayName: "Liis Tamm",
          nationalityCode: "EE",
          portraitUrl: "/athletes/demo/liis-tamm.svg",
          biographyEt: "Väljamõeldud Eesti keskmaajooksja.",
          biographyEn: "A fictional Estonian middle-distance runner.",
          isDemo: true,
        },
        {
          id: DEMO_ATHLETE_IDS.martaKowalska,
          primarySportId: DEMO_SPORT_IDS.athletics,
          slug: "marta-kowalska-demo",
          givenName: "Marta",
          familyName: "Kowalska",
          displayName: "Marta Kowalska",
          nationalityCode: "PL",
          portraitUrl: "/athletes/demo/marta-kowalska.svg",
          biographyEt: "Väljamõeldud Poola keskmaajooksja.",
          biographyEn: "A fictional Polish middle-distance runner.",
          isDemo: true,
        },
        {
          id: DEMO_ATHLETE_IDS.anuSaar,
          primarySportId: DEMO_SPORT_IDS.rowing,
          slug: "anu-saar-demo",
          givenName: "Anu",
          familyName: "Saar",
          displayName: "Anu Saar",
          nationalityCode: "EE",
          portraitUrl: "/athletes/demo/anu-saar.svg",
          biographyEt: "Väljamõeldud Eesti sõudja.",
          biographyEn: "A fictional Estonian rower.",
          isDemo: true,
        },
        {
          id: DEMO_ATHLETE_IDS.sofiaLind,
          primarySportId: DEMO_SPORT_IDS.rowing,
          slug: "sofia-lind-demo",
          givenName: "Sofia",
          familyName: "Lind",
          displayName: "Sofia Lind",
          nationalityCode: "SE",
          portraitUrl: "/athletes/demo/sofia-lind.svg",
          biographyEt: "Väljamõeldud Rootsi sõudja.",
          biographyEn: "A fictional Swedish rower.",
          isDemo: true,
        },
        {
          id: DEMO_ATHLETE_IDS.rasmusPoder,
          primarySportId: DEMO_SPORT_IDS.volleyball,
          slug: "rasmus-poder-demo",
          givenName: "Rasmus",
          familyName: "Põder",
          displayName: "Rasmus Põder",
          nationalityCode: "EE",
          portraitUrl: "/athletes/demo/rasmus-poder.svg",
          biographyEt: "Väljamõeldud Eesti võrkpallur.",
          biographyEn: "A fictional Estonian volleyball player.",
          isDemo: true,
        },
      ])
      .onConflictDoUpdate({
        target: tables.athletes.id,
        set: { portraitUrl: sql`excluded.portrait_url`, updatedAt: now },
      });

    await tx
      .insert(tables.athleteTeamMemberships)
      .values([
        {
          athleteId: DEMO_ATHLETE_IDS.mariMets,
          teamId: DEMO_TEAM_IDS.nordhavn,
          startsAt: new Date("2025-07-01T00:00:00.000Z"),
          shirtNumber: "23",
        },
        {
          athleteId: DEMO_ATHLETE_IDS.karlKask,
          teamId: DEMO_TEAM_IDS.rheinburg,
          startsAt: new Date("2025-08-01T00:00:00.000Z"),
          shirtNumber: "7",
        },
        {
          athleteId: DEMO_ATHLETE_IDS.rasmusPoder,
          teamId: DEMO_TEAM_IDS.tallinnLaine,
          startsAt: new Date("2025-08-01T00:00:00.000Z"),
          shirtNumber: "11",
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tables.competitions)
      .values([
        {
          id: DEMO_COMPETITION_IDS.winterSeries,
          sportId: DEMO_SPORT_IDS.biathlon,
          slug: "pohjala-talvesari-demo",
          name: "Põhjala talvesari (demo)",
          nameEt: "Põhjala talvesari (demo)",
          nameEn: "Northern Winter Series (demo)",
          organizer: "RADA demo",
          countryCode: "EE",
          isDemo: true,
        },
        {
          id: DEMO_COMPETITION_IDS.basketballCup,
          sportId: DEMO_SPORT_IDS.basketball,
          slug: "pohja-korvpallikarikas-demo",
          name: "Põhja korvpallikarikas (demo)",
          nameEt: "Põhja korvpallikarikas (demo)",
          nameEn: "Northern Basketball Cup (demo)",
          organizer: "RADA demo",
          isDemo: true,
        },
        {
          id: DEMO_COMPETITION_IDS.trackNight,
          sportId: DEMO_SPORT_IDS.athletics,
          slug: "tallinna-jooksuohtu-demo",
          name: "Tallinna jooksuõhtu (demo)",
          nameEt: "Tallinna jooksuõhtu (demo)",
          nameEn: "Tallinn Track Night (demo)",
          organizer: "RADA demo",
          countryCode: "EE",
          isDemo: true,
        },
        {
          id: DEMO_COMPETITION_IDS.indoorRowing,
          sportId: DEMO_SPORT_IDS.rowing,
          slug: "balti-siseaerutamine-demo",
          name: "Balti sisesõudmine (demo)",
          nameEt: "Balti sisesõudmine (demo)",
          nameEn: "Baltic Indoor Rowing (demo)",
          organizer: "RADA demo",
          countryCode: "EE",
          isDemo: true,
        },
        {
          id: DEMO_COMPETITION_IDS.coastalVolleyball,
          sportId: DEMO_SPORT_IDS.volleyball,
          slug: "laaneranniku-vorkpall-demo",
          name: "Lääneranniku võrkpalliliiga (demo)",
          nameEt: "Lääneranniku võrkpalliliiga (demo)",
          nameEn: "West Coast Volleyball League (demo)",
          organizer: "RADA demo",
          isDemo: true,
        },
      ])
      .onConflictDoNothing();

    const seasonRows: Array<typeof tables.seasons.$inferInsert> = [
      {
        id: ids.season.winter,
        competitionId: DEMO_COMPETITION_IDS.winterSeries,
        name: "Jooksev demohooaeg",
        startsAt: daysFrom(now, -180),
        endsAt: daysFrom(now, 180),
        isCurrent: true,
      },
      {
        id: ids.season.basketball,
        competitionId: DEMO_COMPETITION_IDS.basketballCup,
        name: "Jooksev demohooaeg",
        startsAt: daysFrom(now, -180),
        endsAt: daysFrom(now, 180),
        isCurrent: true,
      },
      {
        id: ids.season.athletics,
        competitionId: DEMO_COMPETITION_IDS.trackNight,
        name: "Jooksev demohooaeg",
        startsAt: daysFrom(now, -180),
        endsAt: daysFrom(now, 180),
        isCurrent: true,
      },
      {
        id: ids.season.rowing,
        competitionId: DEMO_COMPETITION_IDS.indoorRowing,
        name: "Jooksev demohooaeg",
        startsAt: daysFrom(now, -180),
        endsAt: daysFrom(now, 180),
        isCurrent: true,
      },
      {
        id: ids.season.volleyball,
        competitionId: DEMO_COMPETITION_IDS.coastalVolleyball,
        name: "Jooksev demohooaeg",
        startsAt: daysFrom(now, -180),
        endsAt: daysFrom(now, 180),
        isCurrent: true,
      },
    ];
    for (const row of seasonRows) {
      const changes = row;
      await tx
        .insert(tables.seasons)
        .values(row)
        .onConflictDoUpdate({ target: tables.seasons.id, set: { ...changes, updatedAt: now } });
    }

    await tx
      .insert(tables.venues)
      .values([
        {
          id: ids.venue.winter,
          slug: "otepaa-talverada-demo",
          name: "Otepää talverada (demo)",
          city: "Otepää",
          countryCode: "EE",
          timezone: "Europe/Tallinn",
          latitude: "58.058056",
          longitude: "26.496389",
          isDemo: true,
        },
        {
          id: ids.venue.arena,
          slug: "rada-arena-tallinn-demo",
          name: "RADA Arena (demo)",
          city: "Tallinn",
          countryCode: "EE",
          timezone: "Europe/Tallinn",
          latitude: "59.437000",
          longitude: "24.753600",
          isDemo: true,
        },
        {
          id: ids.venue.stadium,
          slug: "tartu-jooksustaadion-demo",
          name: "Tartu jooksustaadion (demo)",
          city: "Tartu",
          countryCode: "EE",
          timezone: "Europe/Tallinn",
          isDemo: true,
        },
        {
          id: ids.venue.boathouse,
          slug: "parnu-soudehall-demo",
          name: "Pärnu sõudehall (demo)",
          city: "Pärnu",
          countryCode: "EE",
          timezone: "Europe/Tallinn",
          isDemo: true,
        },
        {
          id: ids.venue.hall,
          slug: "kuressaare-ranniku-hall-demo",
          name: "Kuressaare ranniku hall (demo)",
          city: "Kuressaare",
          countryCode: "EE",
          timezone: "Europe/Tallinn",
          isDemo: true,
        },
      ])
      .onConflictDoNothing();

    const eventRows: Array<typeof tables.events.$inferInsert> = [
      {
        id: DEMO_EVENT_IDS.liveBiathlon,
        competitionId: DEMO_COMPETITION_IDS.winterSeries,
        seasonId: ids.season.winter,
        venueId: ids.venue.winter,
        slug: "demo-laskesuusatamine-otse",
        titleEt: "Naiste 10 km jälitussõit — DEMO",
        titleEn: "Women's 10 km pursuit — DEMO",
        descriptionEt: "Väljamõeldud võistlus koos avaliku testvideoga.",
        descriptionEn: "A fictional event paired with a public test video stream.",
        state: "live",
        scheduledStartAt: minutesFrom(now, -24),
        actualStartAt: minutesFrom(now, -21),
        endAt: minutesFrom(now, 56),
        statusDetailEt: "Otseülekanne — demovõistlus",
        statusDetailEn: "Live — demo competition",
        isDemo: true,
        version: 1,
      },
      {
        id: DEMO_EVENT_IDS.startingSoonBasketball,
        competitionId: DEMO_COMPETITION_IDS.basketballCup,
        seasonId: ids.season.basketball,
        venueId: ids.venue.arena,
        slug: "demo-rheinburg-tartu-torm",
        titleEt: "Rheinburg BC – Tartu Torm — DEMO",
        titleEn: "Rheinburg BC vs Tartu Torm — DEMO",
        descriptionEt: "Väljamõeldud klubimäng, kus osaleb Eesti mängija Karl Kask.",
        descriptionEn: "A fictional club game featuring Estonian player Karl Kask.",
        state: "scheduled",
        scheduledStartAt: minutesFrom(now, 35),
        endAt: minutesFrom(now, 155),
        isDemo: true,
        version: 1,
      },
      {
        id: DEMO_EVENT_IDS.upcomingAthletics,
        competitionId: DEMO_COMPETITION_IDS.trackNight,
        seasonId: ids.season.athletics,
        venueId: ids.venue.stadium,
        slug: "demo-naiste-1500m",
        titleEt: "Naiste 1500 m — DEMO",
        titleEn: "Women's 1500 m — DEMO",
        state: "scheduled",
        scheduledStartAt: minutesFrom(now, 240),
        endAt: minutesFrom(now, 260),
        isDemo: true,
        version: 1,
      },
      {
        id: DEMO_EVENT_IDS.replayRowing,
        competitionId: DEMO_COMPETITION_IDS.indoorRowing,
        seasonId: ids.season.rowing,
        venueId: ids.venue.boathouse,
        slug: "demo-naiste-uksikaeruline-kordus",
        titleEt: "Naiste ühepaat — DEMO kordus",
        titleEn: "Women's single sculls — DEMO replay",
        state: "finished",
        scheduledStartAt: minutesFrom(now, -1560),
        actualStartAt: minutesFrom(now, -1558),
        endAt: minutesFrom(now, -1478),
        isDemo: true,
        version: 1,
      },
      {
        id: DEMO_EVENT_IDS.delayedVolleyball,
        competitionId: DEMO_COMPETITION_IDS.coastalVolleyball,
        seasonId: ids.season.volleyball,
        venueId: ids.venue.hall,
        slug: "demo-tallinn-laine-riga-vektors",
        titleEt: "Tallinn Laine – Rīga Vektors — DEMO",
        titleEn: "Tallinn Laine vs Rīga Vektors — DEMO",
        state: "delayed",
        originalStartAt: minutesFrom(now, 125),
        scheduledStartAt: minutesFrom(now, 180),
        endAt: minutesFrom(now, 300),
        statusDetailEt: "Algus lükkus 55 minutit edasi",
        statusDetailEn: "Start delayed by 55 minutes",
        isDemo: true,
        version: 2,
      },
      {
        id: DEMO_EVENT_IDS.cancelledVolleyball,
        competitionId: DEMO_COMPETITION_IDS.coastalVolleyball,
        seasonId: ids.season.volleyball,
        venueId: ids.venue.hall,
        slug: "demo-ranniku-karikas-tuhistatud",
        titleEt: "Ranniku karikas — DEMO, tühistatud",
        titleEn: "Coastal Cup — DEMO, cancelled",
        state: "cancelled",
        scheduledStartAt: minutesFrom(now, 1440),
        statusDetailEt: "Väljak ei ole mängukõlblik",
        statusDetailEn: "Court unavailable",
        isDemo: true,
        version: 2,
      },
    ];
    for (const row of eventRows) {
      const changes = row;
      await tx
        .insert(tables.events)
        .values(row)
        .onConflictDoUpdate({ target: tables.events.id, set: { ...changes, updatedAt: now } });
    }

    await tx
      .insert(tables.eventParticipants)
      .values([
        {
          id: ids.participant.liveMari,
          eventId: DEMO_EVENT_IDS.liveBiathlon,
          athleteId: DEMO_ATHLETE_IDS.mariMets,
          isEstonian: true,
          seed: 4,
        },
        {
          id: ids.participant.liveAino,
          eventId: DEMO_EVENT_IDS.liveBiathlon,
          athleteId: DEMO_ATHLETE_IDS.ainoLaine,
          seed: 2,
        },
        {
          id: ids.participant.basketballHome,
          eventId: DEMO_EVENT_IDS.startingSoonBasketball,
          teamId: DEMO_TEAM_IDS.rheinburg,
          role: "home",
        },
        {
          id: ids.participant.basketballAway,
          eventId: DEMO_EVENT_IDS.startingSoonBasketball,
          teamId: DEMO_TEAM_IDS.tartuTorm,
          role: "away",
          isEstonian: true,
        },
        {
          id: ids.participant.basketballKarl,
          eventId: DEMO_EVENT_IDS.startingSoonBasketball,
          athleteId: DEMO_ATHLETE_IDS.karlKask,
          isEstonian: true,
          metadata: { representsTeamId: DEMO_TEAM_IDS.rheinburg },
        },
        {
          id: ids.participant.athleticsLiis,
          eventId: DEMO_EVENT_IDS.upcomingAthletics,
          athleteId: DEMO_ATHLETE_IDS.liisTamm,
          isEstonian: true,
          laneOrPosition: "4",
        },
        {
          id: ids.participant.athleticsMarta,
          eventId: DEMO_EVENT_IDS.upcomingAthletics,
          athleteId: DEMO_ATHLETE_IDS.martaKowalska,
          laneOrPosition: "5",
        },
        {
          id: ids.participant.rowingAnu,
          eventId: DEMO_EVENT_IDS.replayRowing,
          athleteId: DEMO_ATHLETE_IDS.anuSaar,
          isEstonian: true,
          laneOrPosition: "3",
        },
        {
          id: ids.participant.rowingSofia,
          eventId: DEMO_EVENT_IDS.replayRowing,
          athleteId: DEMO_ATHLETE_IDS.sofiaLind,
          laneOrPosition: "4",
        },
        {
          id: ids.participant.volleyballHome,
          eventId: DEMO_EVENT_IDS.delayedVolleyball,
          teamId: DEMO_TEAM_IDS.tallinnLaine,
          role: "home",
          isEstonian: true,
        },
        {
          id: ids.participant.volleyballAway,
          eventId: DEMO_EVENT_IDS.delayedVolleyball,
          teamId: DEMO_TEAM_IDS.rigaVektors,
          role: "away",
        },
        {
          id: ids.participant.volleyballRasmus,
          eventId: DEMO_EVENT_IDS.delayedVolleyball,
          athleteId: DEMO_ATHLETE_IDS.rasmusPoder,
          isEstonian: true,
          metadata: { representsTeamId: DEMO_TEAM_IDS.tallinnLaine },
        },
        {
          id: ids.participant.cancelledHome,
          eventId: DEMO_EVENT_IDS.cancelledVolleyball,
          teamId: DEMO_TEAM_IDS.tallinnLaine,
          role: "home",
          isEstonian: true,
        },
        {
          id: ids.participant.cancelledAway,
          eventId: DEMO_EVENT_IDS.cancelledVolleyball,
          teamId: DEMO_TEAM_IDS.rigaVektors,
          role: "away",
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tables.products)
      .values([
        {
          id: ids.product.monthly,
          code: "rada-demo-monthly",
          kind: "subscription",
          nameEt: "RADA kuupakett (demo)",
          nameEn: "RADA monthly (demo)",
          descriptionEt: "Testtoode; makset ei võeta.",
          descriptionEn: "Test product; no payment is taken.",
          priceMinor: 999,
          currency: "EUR",
          billingInterval: "month",
          trialDays: 7,
          maxConcurrentStreams: 2,
          metadata: { demo: true },
        },
        {
          id: ids.product.eventPass,
          code: "rada-demo-event-pass",
          kind: "event_pass",
          nameEt: "Ühe sündmuse pääse (demo)",
          nameEn: "Single event pass (demo)",
          priceMinor: 499,
          currency: "EUR",
          billingInterval: "one_time",
          maxConcurrentStreams: 1,
          metadata: { demo: true },
        },
      ])
      .onConflictDoNothing();

    const subscriptionRow: typeof tables.subscriptions.$inferInsert = {
      id: ids.subscription,
      userId: DEMO_USER_ID,
      productId: ids.product.monthly,
      state: "active",
      provider: "demo-no-payment-provider",
      providerCustomerRef: "demo-customer",
      providerSubscriptionRef: "demo-subscription",
      currentPeriodStart: daysFrom(now, -15),
      currentPeriodEnd: daysFrom(now, 15),
    };
    {
      const changes = subscriptionRow;
      await tx
        .insert(tables.subscriptions)
        .values(subscriptionRow)
        .onConflictDoUpdate({
          target: tables.subscriptions.id,
          set: { ...changes, updatedAt: now },
        });
    }

    const entitlementRow: typeof tables.entitlements.$inferInsert = {
      id: ids.entitlement,
      userId: DEMO_USER_ID,
      profileId: DEMO_PROFILE_ID,
      productId: ids.product.monthly,
      subscriptionId: ids.subscription,
      source: "subscription",
      sourceReference: "demo-entitlement",
      startsAt: daysFrom(now, -15),
      endsAt: daysFrom(now, 15),
    };
    {
      const changes = entitlementRow;
      await tx
        .insert(tables.entitlements)
        .values(entitlementRow)
        .onConflictDoUpdate({
          target: tables.entitlements.id,
          set: { ...changes, updatedAt: now },
        });
    }

    const mediaRows: Array<typeof tables.mediaAssets.$inferInsert> = [
      {
        id: ids.media.replay,
        eventId: DEMO_EVENT_IDS.replayRowing,
        kind: "replay",
        state: "ready",
        titleEt: "Naiste ühepaadi täispikk kordus — DEMO",
        titleEn: "Women's single sculls full replay — DEMO",
        storageKey: "demo/replay/rowing/master.m3u8",
        providerReference: "public-test-stream-replay",
        mimeType: "application/vnd.apple.mpegurl",
        durationSeconds: 4800,
        spoilerSensitive: true,
        availableAt: minutesFrom(now, -1450),
        expiresAt: daysFrom(now, 7),
        isDemo: true,
      },
      {
        id: ids.media.highlight,
        eventId: DEMO_EVENT_IDS.replayRowing,
        kind: "highlight",
        state: "ready",
        titleEt: "Finišihetked — DEMO",
        titleEn: "Finish highlights — DEMO",
        storageKey: "demo/highlights/rowing-finish/master.m3u8",
        providerReference: "public-test-stream-highlight",
        mimeType: "application/vnd.apple.mpegurl",
        durationSeconds: 75,
        spoilerSensitive: true,
        availableAt: minutesFrom(now, -1430),
        expiresAt: daysFrom(now, 30),
        isDemo: true,
      },
      {
        id: ids.media.poster,
        eventId: DEMO_EVENT_IDS.liveBiathlon,
        kind: "poster",
        state: "ready",
        titleEt: "Laskesuusatamise demopilt",
        titleEn: "Biathlon demo poster",
        storageKey: "demo/posters/biathlon.svg",
        mimeType: "image/svg+xml",
        spoilerSensitive: false,
        availableAt: daysFrom(now, -1),
        expiresAt: daysFrom(now, 30),
        isDemo: true,
      },
    ];
    for (const row of mediaRows) {
      const changes = row;
      await tx
        .insert(tables.mediaAssets)
        .values(row)
        .onConflictDoUpdate({
          target: tables.mediaAssets.id,
          set: { ...changes, updatedAt: now },
        });
    }

    const publicTestHls = "https://test-streams.mux.dev/tos_ismc/main.m3u8";
    const streamRows: Array<typeof tables.streams.$inferInsert> = [
      {
        id: ids.stream.live,
        eventId: DEMO_EVENT_IDS.liveBiathlon,
        protocol: "hls",
        state: "live",
        priority: 10,
        playbackLocator: publicTestHls,
        provider: "mux-public-test",
        providerStreamRef: "rada-demo-live",
        requiresSignedAccess: false,
        dvrWindowSeconds: 1800,
        captionsAvailable: false,
        isDemo: true,
        lastHealthyAt: now,
      },
      {
        id: ids.stream.basketball,
        eventId: DEMO_EVENT_IDS.startingSoonBasketball,
        protocol: "hls",
        state: "ready",
        priority: 10,
        playbackLocator: publicTestHls,
        provider: "mux-public-test",
        providerStreamRef: "rada-demo-basketball",
        requiresSignedAccess: false,
        dvrWindowSeconds: 3600,
        isDemo: true,
        lastHealthyAt: now,
      },
      {
        id: ids.stream.replay,
        eventId: DEMO_EVENT_IDS.replayRowing,
        protocol: "hls",
        state: "ended",
        priority: 10,
        playbackLocator: publicTestHls,
        provider: "mux-public-test",
        providerStreamRef: "rada-demo-replay",
        requiresSignedAccess: false,
        dvrWindowSeconds: 0,
        isDemo: true,
        lastHealthyAt: now,
      },
      {
        id: ids.stream.delayed,
        eventId: DEMO_EVENT_IDS.delayedVolleyball,
        protocol: "hls",
        state: "unavailable",
        priority: 10,
        playbackLocator: "/demo-media/generated/unavailable.m3u8",
        provider: "local-demo-placeholder",
        providerStreamRef: "rada-demo-delayed",
        requiresSignedAccess: true,
        dvrWindowSeconds: 0,
        isDemo: true,
      },
    ];
    for (const row of streamRows) {
      const changes = row;
      await tx
        .insert(tables.streams)
        .values(row)
        .onConflictDoUpdate({ target: tables.streams.id, set: { ...changes, updatedAt: now } });
    }

    await tx
      .insert(tables.streamRenditions)
      .values(
        [ids.stream.live, ids.stream.basketball, ids.stream.replay].flatMap(
          (streamId, streamIndex) => [
            {
              id: `92000000-0000-4000-8000-00000000000${streamIndex * 3 + 1}`,
              streamId,
              label: "360p",
              width: 640,
              height: 360,
              videoBitrateKbps: 700,
              audioBitrateKbps: 64,
              codec: "avc1.4d401e,mp4a.40.2",
              frameRate: "25.000",
              isDataSaver: true,
            },
            {
              id: `92000000-0000-4000-8000-00000000000${streamIndex * 3 + 2}`,
              streamId,
              label: "720p",
              width: 1280,
              height: 720,
              videoBitrateKbps: 2800,
              audioBitrateKbps: 128,
              codec: "avc1.4d401f,mp4a.40.2",
              frameRate: "50.000",
            },
            {
              id: `92000000-0000-4000-8000-00000000000${streamIndex * 3 + 3}`,
              streamId,
              label: "1080p",
              width: 1920,
              height: 1080,
              videoBitrateKbps: 5200,
              audioBitrateKbps: 160,
              codec: "avc1.64002a,mp4a.40.2",
              frameRate: "50.000",
            },
          ],
        ),
      )
      .onConflictDoNothing();

    const rightsRows: Array<typeof tables.rightsWindows.$inferInsert> = [
      {
        id: ids.rights.live,
        streamId: ids.stream.live,
        contentKind: "live",
        countryCode: "EE",
        access: "free",
        startsAt: minutesFrom(now, -120),
        endsAt: minutesFrom(now, 180),
        dvrAllowed: true,
        recordingAllowed: true,
        maxConcurrentStreams: 2,
        rightsHolder: "RADA fictional demo rights",
        contractReference: "DEMO-NOT-A-CONTRACT",
        priority: 10,
      },
      {
        id: ids.rights.basketball,
        eventId: DEMO_EVENT_IDS.startingSoonBasketball,
        contentKind: "live",
        countryCode: "EE",
        access: "entitled",
        requiredProductId: ids.product.monthly,
        startsAt: daysFrom(now, -1),
        endsAt: daysFrom(now, 1),
        dvrAllowed: true,
        recordingAllowed: true,
        maxConcurrentStreams: 2,
        rightsHolder: "RADA fictional demo rights",
        contractReference: "DEMO-NOT-A-CONTRACT",
        priority: 10,
      },
      {
        id: ids.rights.athletics,
        eventId: DEMO_EVENT_IDS.upcomingAthletics,
        contentKind: "live",
        countryCode: "EE",
        access: "external_only",
        externalWatchUrl: "https://example.com/rada-demo-viewing-destination",
        startsAt: daysFrom(now, -1),
        endsAt: daysFrom(now, 1),
        rightsHolder: "External destination placeholder",
        priority: 10,
      },
      {
        id: ids.rights.replay,
        mediaAssetId: ids.media.replay,
        contentKind: "replay",
        countryCode: "EE",
        access: "free",
        startsAt: daysFrom(now, -2),
        endsAt: daysFrom(now, 7),
        rightsHolder: "RADA fictional demo rights",
        contractReference: "DEMO-NOT-A-CONTRACT",
        priority: 10,
      },
      {
        id: ids.rights.delayed,
        eventId: DEMO_EVENT_IDS.delayedVolleyball,
        contentKind: "live",
        countryCode: "EE",
        access: "entitled",
        requiredProductId: ids.product.eventPass,
        startsAt: daysFrom(now, -1),
        endsAt: daysFrom(now, 1),
        maxConcurrentStreams: 1,
        rightsHolder: "RADA fictional demo rights",
        contractReference: "DEMO-NOT-A-CONTRACT",
        priority: 10,
      },
    ];
    for (const row of rightsRows) {
      const changes = row;
      await tx
        .insert(tables.rightsWindows)
        .values(row)
        .onConflictDoUpdate({
          target: tables.rightsWindows.id,
          set: { ...changes, updatedAt: now },
        });
    }

    await tx
      .insert(tables.follows)
      .values([
        {
          id: ids.follow.athlete,
          profileId: DEMO_PROFILE_ID,
          athleteId: DEMO_ATHLETE_IDS.mariMets,
        },
        {
          id: ids.follow.team,
          profileId: DEMO_PROFILE_ID,
          teamId: DEMO_TEAM_IDS.rheinburg,
        },
        {
          id: ids.follow.sport,
          profileId: DEMO_PROFILE_ID,
          sportId: DEMO_SPORT_IDS.volleyball,
        },
        {
          id: ids.follow.competition,
          profileId: DEMO_PROFILE_ID,
          competitionId: DEMO_COMPETITION_IDS.trackNight,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tables.notificationPreferences)
      .values([
        {
          id: ids.preference.starting,
          profileId: DEMO_PROFILE_ID,
          channel: "in_app",
          kind: "event_starting_soon",
          enabled: true,
          leadMinutes: 15,
        },
        {
          id: ids.preference.highlight,
          profileId: DEMO_PROFILE_ID,
          channel: "in_app",
          kind: "highlight_available",
          enabled: true,
          leadMinutes: 0,
        },
        {
          id: ids.preference.athlete,
          profileId: DEMO_PROFILE_ID,
          channel: "in_app",
          kind: "followed_athlete_competing",
          athleteId: DEMO_ATHLETE_IDS.mariMets,
          enabled: true,
          leadMinutes: 30,
        },
      ])
      .onConflictDoNothing();

    const notificationRows: Array<typeof tables.notifications.$inferInsert> = [
      {
        id: ids.notification.starting,
        userId: DEMO_USER_ID,
        profileId: DEMO_PROFILE_ID,
        eventId: DEMO_EVENT_IDS.startingSoonBasketball,
        athleteId: DEMO_ATHLETE_IDS.karlKask,
        channel: "in_app",
        kind: "event_starting_soon",
        state: "pending",
        deduplicationKey: "demo:event-starting-soon:basketball",
        locale: "et",
        title: "Mäng algab peagi",
        body: "Karl Kase demomäng algab 35 minuti pärast.",
        scheduledFor: minutesFrom(now, 20),
      },
      {
        id: ids.notification.highlight,
        userId: DEMO_USER_ID,
        profileId: DEMO_PROFILE_ID,
        eventId: DEMO_EVENT_IDS.replayRowing,
        athleteId: DEMO_ATHLETE_IDS.anuSaar,
        channel: "in_app",
        kind: "highlight_available",
        state: "sent",
        deduplicationKey: "demo:highlight-available:rowing",
        locale: "et",
        title: "Tipphetked on valmis",
        body: "Anu Saare demovõistluse finišihetked on vaadatavad.",
        spoilerSensitive: true,
        scheduledFor: minutesFrom(now, -1400),
        sentAt: minutesFrom(now, -1399),
      },
    ];
    for (const row of notificationRows) {
      const changes = row;
      await tx
        .insert(tables.notifications)
        .values(row)
        .onConflictDoUpdate({
          target: tables.notifications.id,
          set: { ...changes, updatedAt: now },
        });
    }

    await tx
      .insert(tables.results)
      .values([
        {
          id: ids.result.anu,
          eventId: DEMO_EVENT_IDS.replayRowing,
          eventParticipantId: ids.participant.rowingAnu,
          rank: 2,
          scoreDisplay: "07:18.42",
          scoreData: { milliseconds: 438420 },
          outcome: "silver",
          isFinal: true,
        },
        {
          id: ids.result.sofia,
          eventId: DEMO_EVENT_IDS.replayRowing,
          eventParticipantId: ids.participant.rowingSofia,
          rank: 1,
          scoreDisplay: "07:16.09",
          scoreData: { milliseconds: 436090 },
          outcome: "gold",
          isFinal: true,
        },
      ])
      .onConflictDoNothing();

    const timelineRows: Array<typeof tables.timelineEvents.$inferInsert> = [
      {
        id: ids.timeline.liveStart,
        eventId: DEMO_EVENT_IDS.liveBiathlon,
        sequence: 1,
        occurredAt: minutesFrom(now, -21),
        eventClock: "00:00",
        kind: "period_start",
        textEt: "Demovõistlus algas.",
        textEn: "The demo event started.",
        spoilerSensitive: false,
      },
      {
        id: ids.timeline.liveUpdate,
        eventId: DEMO_EVENT_IDS.liveBiathlon,
        sequence: 2,
        occurredAt: minutesFrom(now, -8),
        eventClock: "13:00",
        kind: "commentary",
        participantId: ids.participant.liveMari,
        textEt: "Mari Mets läbis teise lasketiiru.",
        textEn: "Mari Mets completed the second shooting stage.",
        data: { position: 4 },
        spoilerSensitive: true,
      },
      {
        id: ids.timeline.replayFinish,
        eventId: DEMO_EVENT_IDS.replayRowing,
        sequence: 1,
        occurredAt: minutesFrom(now, -1478),
        eventClock: "07:18",
        kind: "result",
        participantId: ids.participant.rowingAnu,
        textEt: "Anu Saar lõpetas teisena — DEMO tulemus.",
        textEn: "Anu Saar finished second — DEMO result.",
        data: { rank: 2 },
        spoilerSensitive: true,
      },
    ];
    for (const row of timelineRows) {
      const changes = row;
      await tx
        .insert(tables.timelineEvents)
        .values(row)
        .onConflictDoUpdate({
          target: tables.timelineEvents.id,
          set: { ...changes, updatedAt: now },
        });
    }

    const highlightRow: typeof tables.highlights.$inferInsert = {
      id: ids.highlight,
      eventId: DEMO_EVENT_IDS.replayRowing,
      mediaAssetId: ids.media.highlight,
      titleEt: "Finišiheitlus — DEMO",
      titleEn: "Battle to the finish — DEMO",
      startOffsetSeconds: 0,
      durationSeconds: 75,
      publishedAt: minutesFrom(now, -1430),
      spoilerSensitive: true,
    };
    {
      const changes = highlightRow;
      await tx
        .insert(tables.highlights)
        .values(highlightRow)
        .onConflictDoUpdate({
          target: tables.highlights.id,
          set: { ...changes, updatedAt: now },
        });
    }

    const collectionRow: typeof tables.editorialCollections.$inferInsert = {
      id: ids.collection,
      slug: "eestlased-voistlustules-demo",
      titleEt: "Eestlased võistlustules — DEMO",
      titleEn: "Estonians competing — DEMO",
      descriptionEt: "Toimetatud demovalik; kõik sportlased ja sündmused on väljamõeldud.",
      descriptionEn: "An editorial demo selection; all athletes and events are fictional.",
      state: "published",
      startsAt: daysFrom(now, -1),
      endsAt: daysFrom(now, 2),
      publishedAt: daysFrom(now, -1),
      createdByUserId: DEMO_USER_ID,
    };
    {
      const changes = collectionRow;
      await tx
        .insert(tables.editorialCollections)
        .values(collectionRow)
        .onConflictDoUpdate({
          target: tables.editorialCollections.id,
          set: { ...changes, updatedAt: now },
        });
    }

    await tx
      .insert(tables.editorialCollectionItems)
      .values([
        {
          collectionId: ids.collection,
          position: 0,
          eventId: DEMO_EVENT_IDS.liveBiathlon,
          labelEt: "Praegu otse",
          labelEn: "Live now",
        },
        {
          collectionId: ids.collection,
          position: 1,
          athleteId: DEMO_ATHLETE_IDS.karlKask,
          labelEt: "Eestlane välisklubis",
          labelEn: "Estonian at a foreign club",
        },
        {
          collectionId: ids.collection,
          position: 2,
          highlightId: ids.highlight,
          labelEt: "Värske tipphetk",
          labelEn: "Latest highlight",
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tables.ingestionSources)
      .values({
        id: ids.source,
        code: "rada-demo-editorial",
        name: "RADA demo editorial source",
        kind: "manual",
        isActive: true,
        trustPriority: 1,
        lastSuccessfulSyncAt: now,
      })
      .onConflictDoNothing();

    await tx
      .insert(tables.sourceRecords)
      .values([
        {
          id: ids.sourceRecord.live,
          sourceId: ids.source,
          entityType: "event",
          entityId: DEMO_EVENT_IDS.liveBiathlon,
          externalId: "demo-live-biathlon",
          externalVersion: "1",
          rawPayload: { fictional: true, source: "seed" },
          lastSeenAt: now,
        },
        {
          id: ids.sourceRecord.basketball,
          sourceId: ids.source,
          entityType: "event",
          entityId: DEMO_EVENT_IDS.startingSoonBasketball,
          externalId: "demo-upcoming-basketball",
          externalVersion: "1",
          rawPayload: { fictional: true, source: "seed" },
          lastSeenAt: now,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(tables.auditLogs)
      .values({
        id: ids.audit,
        actorUserId: DEMO_USER_ID,
        action: "demo.seed.created",
        entityType: "dataset",
        entityId: DEMO_USER_ID,
        requestId: "demo-seed-v1",
        reason: "Clearly fictional local development data",
        after: { fictional: true, safeForDevelopment: true },
        occurredAt: now,
      })
      .onConflictDoNothing();

    const outboxRow: typeof tables.outboxEvents.$inferInsert = {
      id: ids.outbox,
      aggregateType: "event",
      aggregateId: DEMO_EVENT_IDS.startingSoonBasketball,
      eventType: "event.schedule.seeded",
      deduplicationKey: "demo:event-schedule-seeded:basketball",
      payload: {
        eventId: DEMO_EVENT_IDS.startingSoonBasketball,
        fictional: true,
      },
      state: "pending",
      availableAt: now,
    };
    {
      const changes = outboxRow;
      await tx
        .insert(tables.outboxEvents)
        .values(outboxRow)
        .onConflictDoUpdate({
          target: tables.outboxEvents.id,
          set: { ...changes, updatedAt: now },
        });
    }
  });

  console.info(
    JSON.stringify(
      {
        message: "Fictional RADA demo data seeded.",
        generatedAt: now.toISOString(),
        liveEventId: DEMO_EVENT_IDS.liveBiathlon,
        upcomingEventId: DEMO_EVENT_IDS.startingSoonBasketball,
        replayEventId: DEMO_EVENT_IDS.replayRowing,
        profileId: DEMO_PROFILE_ID,
      },
      null,
      2,
    ),
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
