// The year plan: Sep 28, 2026 -> launch on Sep 23, 2027.
//
// Written as your product manager / senior developer. Rolling-wave planning:
//   - Oct-Dec 2026: every weekday morning is a ticket (Goal, How it works,
//     Steps, Done when), about 3 hours of deep work.
//   - Jan-Sep 2027: each milestone has a week-by-week plan in its
//     description; it gets broken into daily tickets at the start of its month.
//
// Quarters follow the calendar (the roadmap's "Q1 · Sep–Dec 2026" is Q4 2026).
// Work days are Monday to Friday; weekends and Dec 24 - Jan 1 are rest.
// Each ticket is due on the Friday of its week, so a morning that slips can
// be caught up before it counts as overdue.
import { addDays, weekdayIndex } from "../core/dates.js";

export const PLAN_VERSION = "2026-27.1";

// Quarterly goals: one per roadmap phase.
const GOALS = [
  { key: "g1", roadmap: "q1", quarter: 4, year: 2026, deadline: "2026-12-31",
    title: "Build the shared foundation",
    description: "Design system, auth and the points engine, proven out on Guxo Flights. Everything the three apps will share gets built and tested here first." },
  { key: "g2", roadmap: "q2", quarter: 1, year: 2027, deadline: "2027-03-31",
    title: "Ship Guxo Flights; start Guxo",
    description: "Guxo Flights goes public (sibling #1). Guxo is built on the shared foundation from day one." },
  { key: "g3", roadmap: "q3", quarter: 2, year: 2027, deadline: "2027-06-30",
    title: "Ship Guxo; start Gexi's payments",
    description: "Guxo goes public (sibling #2). Gexi's payment options are scoped and its shopping flow is built." },
  { key: "g4", roadmap: "q4", quarter: 3, year: 2027, deadline: "2027-09-23",
    title: "Ship Gexi; connect the network",
    description: "Gexi goes public (sibling #3) and shared loyalty goes live across all three apps. Launch day: Sep 23, 2027." },
];

// Milestones: the 23 roadmap items, in order. `id` matches the roadmap
// checklist item it came from (roadmap quarter + item id), so its done state
// carries over. `start` is when its work begins; `weeks` is the plan for
// milestones that don't have daily tickets yet.
const MILESTONES = [
  // Q4 2026 (roadmap Q1)
  { id: "q1-1", goal: "g1", start: "2026-09-21", deadline: "2026-10-31", priority: "high", category: "Guxo Flights",
    title: "Build Guxo Flights' navigation and core screen structure in React Native" },
  { id: "q1-2", goal: "g1", start: "2026-09-21", deadline: "2026-10-31", priority: "high", category: "Shared",
    title: "Build the shared design system / component kit (colors, type, buttons, cards)" },
  { id: "q1-3", goal: "g1", start: "2026-09-28", deadline: "2026-11-30", priority: "urgent", category: "Guxo Flights",
    title: "Wire state management and live API integration into Guxo Flights' booking flow",
    description: "Daily tickets: Sep 28 - Oct 23. Buffer until the Nov 30 deadline." },
  { id: "q1-4", goal: "g1", start: "2026-10-26", deadline: "2026-11-30", priority: "high", category: "Shared",
    title: "Build the shared auth pattern for all three sibling apps",
    description: "Daily tickets: Oct 26 - Nov 20." },
  { id: "q1-5", goal: "g1", start: "2026-11-23", deadline: "2026-12-31", priority: "high", category: "Shared",
    title: "Build the shared points/promotions data model across Guxo Flights, Guxo, Gexi",
    description: "Daily tickets: Nov 23 - Dec 11." },
  { id: "q1-6", goal: "g1", start: "2026-12-14", deadline: "2026-12-31", priority: "urgent", category: "Guxo Flights",
    title: "Ship Guxo Flights' real end-to-end booking flow (search → select → book)",
    description: "Daily tickets: Dec 14 - Dec 23. Dec 24 - Jan 1 is rest and buffer." },

  // Q1 2027 (roadmap Q2)
  { id: "q2-1", goal: "g2", start: "2027-01-04", deadline: "2027-01-31", priority: "high", category: "Guxo Flights",
    title: "Polish Guxo Flights' booking flow for real use — edge, empty, error, and loading states",
    weeks: [
      ["Jan 4", "Audit every screen for empty, loading and error states; list gaps as tasks. Add skeleton loaders."],
      ["Jan 11", "Offline and slow-network handling, retry buttons, form validation messages, accessibility pass (labels, contrast, font scaling)."],
    ] },
  { id: "q2-2", goal: "g2", start: "2027-01-18", deadline: "2027-01-31", priority: "high", category: "Guxo Flights",
    title: "Wire Guxo Flights into the shared points/promotions system for real",
    weeks: [
      ["Jan 18", "Earn points on confirmed bookings in production data; show balance and history; apply live promotions."],
      ["Jan 25", "Spend points at checkout end to end; edge cases (refunds, cancellations reverse points); tests."],
    ] },
  { id: "q2-3", goal: "g2", start: "2027-02-01", deadline: "2027-02-28", priority: "urgent", category: "Guxo Flights",
    title: "Ship Guxo Flights publicly — sibling #1 live",
    weeks: [
      ["Feb 1", "Production Supabase project, environment config, error monitoring (Sentry), privacy policy and terms."],
      ["Feb 8", "App icons, splash, store screenshots and listing text; EAS builds; TestFlight / internal testing with 5 real users."],
      ["Feb 15", "Fix tester feedback; submit to App Store and Google Play; handle review questions."],
      ["Feb 22", "Launch: announce, watch crash reports and bookings daily, hotfix fast. Write the launch retro."],
    ] },
  { id: "q2-4", goal: "g2", start: "2027-02-22", deadline: "2027-02-28", priority: "high", category: "Guxo",
    title: "Scaffold Guxo on the shared design system and auth pattern",
    weeks: [
      ["Feb 22", "New Expo app for Guxo using the shared package: theme, navigation, sign-in, profile. Brand colors for bus travel."],
    ] },
  { id: "q2-5", goal: "g2", start: "2027-03-01", deadline: "2027-03-31", priority: "high", category: "Guxo",
    title: "Build Guxo's core booking flow (search → select → book)",
    weeks: [
      ["Mar 1", "Data source for bus routes (seeded Supabase tables to start); route and stop search screens."],
      ["Mar 8", "Trip results, seat selection, passenger details, reuse Guxo Flights' booking state patterns."],
      ["Mar 15", "Checkout with test payments, confirmation, tickets screen with QR code."],
    ] },
  { id: "q2-6", goal: "g2", start: "2027-03-22", deadline: "2027-03-31", priority: "high", category: "Guxo",
    title: "Wire Guxo into the shared points/promotions system",
    weeks: [
      ["Mar 22", "Earn and spend points in Guxo using the shared RPCs; one balance across Guxo Flights and Guxo; Q1 review."],
    ] },

  // Q2 2027 (roadmap Q3)
  { id: "q3-1", goal: "g3", start: "2027-04-05", deadline: "2027-04-30", priority: "high", category: "Guxo",
    title: "Polish Guxo's booking flow for real use — edge, empty, error, and loading states",
    weeks: [
      ["Apr 5", "State audit and fixes, offline handling, accessibility pass (as done for Guxo Flights, faster this time)."],
      ["Apr 12", "Real-user test with 5 people; fix the top 10 issues."],
    ] },
  { id: "q3-2", goal: "g3", start: "2027-04-19", deadline: "2027-04-30", priority: "urgent", category: "Guxo",
    title: "Ship Guxo publicly — sibling #2 live",
    weeks: [
      ["Apr 19", "Production config, monitoring, store assets and listings; EAS builds; submit."],
      ["Apr 26", "Launch, monitor, hotfix; cross-promote from Guxo Flights; launch retro."],
    ] },
  { id: "q3-3", goal: "g3", start: "2027-05-03", deadline: "2027-05-31", priority: "high", category: "Gexi",
    title: "Scope Gexi's payment integrations (Telebirr, Chapa, CBE Birr) and pick the first to build",
    weeks: [
      ["May 3", "Read each provider's developer docs and sandbox terms; compare fees, APIs, sign-up requirements; write a one-page decision."],
      ["May 10", "Open the sandbox account for the chosen provider; make a test payment from a script."],
    ] },
  { id: "q3-4", goal: "g3", start: "2027-05-17", deadline: "2027-05-31", priority: "high", category: "Gexi",
    title: "Scaffold Gexi on the shared design system and auth pattern",
    weeks: [
      ["May 17", "New Expo app for Gexi with the shared package: theme, navigation, sign-in, profile, points."],
      ["May 24", "Product catalog tables (products, categories, inventory) with RLS; seed sample products."],
    ] },
  { id: "q3-5", goal: "g3", start: "2027-06-01", deadline: "2027-06-30", priority: "high", category: "Gexi",
    title: "Build Gexi's core shopping flow (browse → cart → checkout)",
    weeks: [
      ["May 31", "Browse and search products, product details with images."],
      ["Jun 7", "Cart state (reuse the booking store pattern), quantities, totals, saved cart."],
      ["Jun 14", "Checkout: address, delivery options, order summary; orders table."],
    ] },
  { id: "q3-6", goal: "g3", start: "2027-06-21", deadline: "2027-06-30", priority: "urgent", category: "Gexi",
    title: "Wire the first payment gateway into Gexi's checkout",
    weeks: [
      ["Jun 21", "Server-side payment intent via Edge Function; redirect/confirm flow; webhook marks the order paid."],
      ["Jun 28", "Failure and refund paths; Q2 review."],
    ] },

  // Q3 2027 (roadmap Q4)
  { id: "q4-1", goal: "g4", start: "2027-07-05", deadline: "2027-07-31", priority: "high", category: "Gexi",
    title: "Polish Gexi's shopping flow for real use — edge, empty, error, and loading states",
    weeks: [
      ["Jul 5", "State audit and fixes; image loading and caching; offline cart."],
      ["Jul 12", "Order tracking screen, notifications for order status."],
      ["Jul 19", "Accessibility pass, performance (lists, images), real-user test."],
      ["Jul 26", "Fix the top issues from testing."],
    ] },
  { id: "q4-2", goal: "g4", start: "2027-08-02", deadline: "2027-08-31", priority: "urgent", category: "Gexi",
    title: "Ship Gexi publicly — sibling #3 live",
    weeks: [
      ["Aug 2", "Production config, monitoring, payment go-live checklist, store assets; submit."],
      ["Aug 9", "Launch, monitor orders and payments daily, hotfix; launch retro."],
    ] },
  { id: "q4-3", goal: "g4", start: "2027-08-16", deadline: "2027-08-31", priority: "high", category: "Shared",
    title: "Wire the shared points/promotions system live across all three apps",
    weeks: [
      ["Aug 16", "Gexi earns and spends points; one balance and history across all three apps."],
      ["Aug 23", "Promotions targeting by app; monitoring and reconciliation report; load test the RPCs."],
    ] },
  { id: "q4-4", goal: "g4", start: "2027-09-01", deadline: "2027-09-30", priority: "high", category: "Shared",
    title: "Run one real cross-app promotion end-to-end",
    weeks: [
      ["Aug 30", "Design the promotion (e.g. book a flight, get double points on your next bus trip); set it up; announce in all three apps."],
      ["Sep 6", "Run it, watch the numbers, fix issues; write up results."],
    ] },
  { id: "q4-5", goal: "g4", start: "2027-09-13", deadline: "2027-09-23", priority: "high", category: "Portfolio",
    title: "Write the Guxo and Gexi case studies (Guxo Flights' is already drafted)",
    weeks: [
      ["Sep 13", "Guxo case study: problem, process, screens, results. Gexi case study the same way."],
      ["Sep 20", "Update the portfolio site with all three; launch-day post on Sep 23."],
    ] },
];

// Daily tickets, Oct-Dec 2026. Each is one morning (about 3 hours of deep
// work plus planning, testing and shutdown).
// Fields: date, milestone, title, priority, goal, how (how it works), steps, done.
const TICKETS = [
  // ---- Milestone q1-3: state management + live API (Sep 28 - Oct 23) ----
  { date: "2026-09-28", ms: "q1-3", priority: "high", title: "Map the booking flow and choose a state library",
    goal: "Know exactly what data the booking flow holds at each step before writing code.",
    how: "Screens share data (the search, the chosen flight, passengers). Passing it through props gets messy fast. A state store keeps that data in one place that any screen can read and update. Zustand is a small, simple store for React Native: you define the data and the functions that change it.",
    steps: ["List every booking screen and what it reads and writes.", "Write the data shape: search (from, to, dates, travellers), selectedOffer, passengers, contact, payment status.", "Compare Zustand, Redux Toolkit and React Context in a short note; pick Zustand.", "Install zustand in guxo-flights-app."],
    done: ["A written data shape in the repo (docs/booking-state.md).", "zustand installed and committed."] },
  { date: "2026-09-29", ms: "q1-3", priority: "high", title: "Build the booking store and connect the Search screen",
    goal: "The Search screen saves the user's search in the store instead of local screen state.",
    how: "A Zustand store is a hook: useBookingStore(). Inside you keep state plus actions like setSearch(). Components subscribe to just the pieces they need (a selector), so they only re-render when that piece changes.",
    steps: ["Create src/store/booking.ts with the search slice and actions.", "Replace the Search screen's useState with the store.", "Show the stored search on the Results screen header.", "Add a reset() action for 'New search'."],
    done: ["Going Search → Results → back keeps the search filled in.", "No prop passing for search data."] },
  { date: "2026-09-30", ms: "q1-3", priority: "high", title: "Add selection and passenger state, and save the draft",
    goal: "A half-finished booking survives closing the app.",
    how: "Zustand's persist middleware saves the store to AsyncStorage (the phone's key-value storage) and reloads it on start. You choose which parts to persist: the draft booking yes, loading flags no.",
    steps: ["Add selectedOffer and passengers slices with actions.", "Wrap the store with persist + AsyncStorage (partialize to the draft only).", "Add a 'Continue your booking' banner on Home when a draft exists.", "Clear the draft when a booking completes."],
    done: ["Kill the app mid-booking, reopen: the draft is still there.", "Starting a new search clears the old draft."] },
  { date: "2026-10-01", ms: "q1-3", priority: "high", title: "Create an API client layer",
    goal: "All network calls go through one small, typed module.",
    how: "Screens shouldn't call fetch() directly. An API client wraps fetch with the base URL, headers, timeouts and error handling in one place, and returns typed data. When the backend changes, you change one file.",
    steps: ["Create src/api/client.ts: request(path, options) with a timeout (AbortController) and JSON parsing.", "Define an ApiError type (network, timeout, http status, parse).", "Create src/api/flights.ts with searchFlights(search) returning mock data for now.", "Call it from the Results screen."],
    done: ["Results come through the API client (mock data is fine).", "Turning off Wi-Fi shows a friendly error, not a crash."] },
  { date: "2026-10-02", ms: "q1-3", priority: "medium", title: "Friday: test on your phone, fix, push, weekly notes",
    goal: "Ship the week: everything works on a real phone and is on GitHub.",
    how: "Weekly shipping keeps work small and visible. Testing on a real device catches what the simulator hides: keyboard, safe areas, slow networks. React DevTools and the Expo dev menu let you inspect state while testing.",
    steps: ["Run the full search → results → select → passengers flow in Expo Go.", "Fix the bugs you find (write each one down first).", "Push to GitHub with clear commit messages.", "Write the weekly note on the Week page: what shipped, what blocked you."],
    done: ["Flow works on the phone.", "Code pushed; weekly note written."] },

  { date: "2026-10-05", ms: "q1-3", priority: "high", title: "Get test access to a real flight API (Amadeus)",
    goal: "Make your first real flight search request outside the app.",
    how: "Amadeus Self-Service offers a free test environment with real-shaped flight data. It uses OAuth2 client credentials: you exchange your API key and secret for a short-lived access token, then send that token with each request.",
    steps: ["Create an Amadeus for Developers account and a test app (API key + secret).", "Read the Flight Offers Search and Airport & City Search docs.", "With curl or Postman: get a token, then search NYC → LAX for a date next month.", "Save a sample response to the repo (docs/samples/flight-offers.json)."],
    done: ["A successful search response saved.", "Notes on the fields you'll need (price, segments, carrier, duration)."] },
  { date: "2026-10-06", ms: "q1-3", priority: "high", title: "Hide the API key behind a Supabase Edge Function",
    goal: "The app gets flight data without the Amadeus secret ever being in the app.",
    how: "Anything shipped inside a mobile app can be extracted, so secrets can't live there. An Edge Function is a small server-side function: the app calls it, it adds the secret and calls Amadeus, then returns the result. Supabase stores the secret as an environment variable.",
    steps: ["Create a Supabase project for Guxo Flights' backend.", "Install the Supabase CLI; create a function flight-search.", "Store AMADEUS_KEY and AMADEUS_SECRET as function secrets.", "Implement: get token (cache it until it expires), forward the search, return JSON.", "Deploy and test it with curl."],
    done: ["curl to your function returns flight offers.", "No secret in the app or the repo."] },
  { date: "2026-10-07", ms: "q1-3", priority: "high", title: "Real airport search in the From / To dropdowns",
    goal: "Typing in From / To suggests real airports and cities.",
    how: "Searching on every keystroke would flood the API. Debouncing waits until the user stops typing for ~300 ms, then sends one request. Results are cached so repeated searches are instant.",
    steps: ["Add an airports action to the Edge Function (Airport & City Search).", "Add searchAirports(query) to the API client.", "Debounce the input (300 ms) and show results in the existing dropdown.", "Store the chosen IATA code (e.g. JFK) in the search slice."],
    done: ["Typing 'new' suggests New York airports.", "Selecting one stores the code and shows 'City (CODE)'."] },
  { date: "2026-10-08", ms: "q1-3", priority: "high", title: "Live flight results mapped to your app's model",
    goal: "The Results screen shows real offers from the API.",
    how: "API responses are shaped for the API, not your UI. A mapper function converts the raw response into your own simple type (Offer: price, carrier, departure, arrival, stops, duration). The UI only knows your type, so an API change only touches the mapper.",
    steps: ["Define the Offer type.", "Write mapOffers(raw) using the saved sample response.", "Call the Edge Function from searchFlights().", "Render real offers on Results."],
    done: ["A real search shows real prices and times.", "The UI never reads raw API fields."] },
  { date: "2026-10-09", ms: "q1-3", priority: "medium", title: "Friday: loading states, test on phone, push, notes",
    goal: "Real data feels fast and never leaves the user staring at a blank screen.",
    how: "Network calls take time. Skeleton placeholders show the layout while loading, so the screen feels responsive. Every request has three outcomes to design: loading, success, error.",
    steps: ["Add skeleton cards on Results while loading.", "Test searches on the phone on Wi-Fi and on mobile data.", "Fix what breaks; push.", "Weekly note."],
    done: ["No blank screens while loading.", "Pushed; weekly note written."] },

  { date: "2026-10-12", ms: "q1-3", priority: "high", title: "Server data with TanStack Query",
    goal: "Flight results are cached, retried and refreshed automatically.",
    how: "There are two kinds of state: client state (what the user chose, in Zustand) and server state (data from the API). TanStack Query manages server state: caching by a key, deduplicating requests, retrying failures and tracking loading/error for you.",
    steps: ["Install @tanstack/react-query and add the QueryClientProvider.", "Replace manual loading code with useQuery(['flights', search], ...).", "Configure staleTime (e.g. 2 minutes) and retry (2).", "Keep the selection in Zustand, the results in Query."],
    done: ["Going back to Results doesn't refetch within 2 minutes.", "Less loading code than before."] },
  { date: "2026-10-13", ms: "q1-3", priority: "high", title: "Flight details and price breakdown",
    goal: "Tapping an offer shows its full details before booking.",
    how: "Details screens read the selected offer from the store (client state) rather than refetching. A price breakdown builds trust: base fare, taxes and fees shown separately, adding up to the total.",
    steps: ["Save the tapped offer with selectOffer().", "Build the details screen: segments timeline, layovers, baggage, fare rules.", "Price breakdown: base, taxes, total (use the API's price fields).", "'Continue' goes to passengers."],
    done: ["Details match the offer tapped.", "Breakdown adds up to the total."] },
  { date: "2026-10-14", ms: "q1-3", priority: "high", title: "Filters and sorting on results",
    goal: "Users can sort by price or time and filter by stops and departure time.",
    how: "Filtering is derived state: keep the raw results and the filter settings, and compute the visible list from them. Memoising (useMemo) avoids recomputing on every render.",
    steps: ["Add filters to the store (stops, time ranges, sort).", "Compute visible offers with useMemo.", "Build a filter sheet (bottom sheet) and sort chips.", "Show 'X of Y flights'."],
    done: ["Sorting and filters update instantly.", "Clearing filters restores all results."] },
  { date: "2026-10-15", ms: "q1-3", priority: "high", title: "Error, empty and rate-limit states",
    goal: "Every failure has a clear message and a way forward.",
    how: "Users forgive errors they understand. Map each ApiError kind to a message and an action: offline → 'Check your connection' + Retry; no results → suggest nearby dates; too many requests (HTTP 429) → wait and retry.",
    steps: ["Create an ErrorState component (icon, message, action).", "Map error kinds to messages.", "Empty results: suggest ±3 days.", "Test each case (airplane mode, impossible route)."],
    done: ["Each error shows a specific message and a working action."] },
  { date: "2026-10-16", ms: "q1-3", priority: "medium", title: "Friday: test, push, weekly notes",
    goal: "Ship the week's work.",
    how: "Same rhythm as every Friday: test the whole flow on a real phone, fix, push, reflect.",
    steps: ["Full flow test on the phone.", "Fix and push.", "Weekly note: what you learned about client vs server state."],
    done: ["Pushed; weekly note written."] },

  { date: "2026-10-19", ms: "q1-3", priority: "high", title: "Confirm the price before passenger details",
    goal: "The price shown at checkout is the real current price.",
    how: "Flight prices change. Airline APIs separate 'search' (fast, cached) from 'price' (confirms the exact offer is still available at that price). Call the pricing endpoint when the user commits to an offer and handle 'price changed'.",
    steps: ["Add a price action to the Edge Function (Flight Offers Price).", "Call it on 'Continue' from details.", "If the price changed, show old vs new and ask to continue.", "Store the confirmed offer."],
    done: ["A price change is shown clearly before passengers."] },
  { date: "2026-10-20", ms: "q1-3", priority: "high", title: "Passenger form with validation",
    goal: "Passenger details are validated before moving on.",
    how: "react-hook-form manages form state without re-rendering on every keystroke; zod describes the rules (a schema) once, and the same schema validates on the client and later on the server.",
    steps: ["Install react-hook-form, zod and @hookform/resolvers.", "Write the passenger schema (names, date of birth, document).", "One form section per traveller from the search.", "Show field errors inline; save to the store."],
    done: ["Invalid input shows clear messages; valid data is saved."] },
  { date: "2026-10-21", ms: "q1-3", priority: "high", title: "Save booking drafts to the backend",
    goal: "A booking draft exists on the server, owned by the user.",
    how: "Server-side drafts let a user continue on another device and give you data for later steps (payment, confirmation). Row Level Security makes sure each user only sees their own bookings, the same way your dashboard protects your tasks.",
    steps: ["Create a bookings table (status, offer JSON, passengers JSON, user_id).", "Enable RLS with 'own rows only' policies.", "Insert/update the draft from the app.", "Check in the Supabase table editor."],
    done: ["Draft saved server-side; another user can't read it (test with a second account)."] },
  { date: "2026-10-22", ms: "q1-3", priority: "high", title: "Unit tests for the store and mappers",
    goal: "The core logic is protected by tests.",
    how: "Pure functions (mappers, filters) and store actions are easy to test without a phone. Jest runs them in seconds; when you change code later, the tests tell you what broke.",
    steps: ["Set up Jest (jest-expo preset).", "Test mapOffers with the saved sample.", "Test filters/sorting and store actions (select, reset, persist partialize).", "Add npm test to the README."],
    done: ["At least 10 passing tests."] },
  { date: "2026-10-23", ms: "q1-3", priority: "medium", title: "Friday: milestone demo and wrap-up",
    goal: "Finish the state management + live API milestone.",
    how: "Closing a milestone means proving it works and writing down what you'd do differently. A short screen recording is also portfolio material.",
    steps: ["Full flow on the phone with real data.", "Record a 60-second demo video.", "Update the README (architecture: store, query, API client, edge function).", "Mark the milestone's tasks done; weekly note."],
    done: ["Demo recorded; README updated; milestone at 100%."] },

  // ---- Milestone q1-4: shared auth pattern (Oct 26 - Nov 20) ----
  { date: "2026-10-26", ms: "q1-4", priority: "high", title: "Design the shared sign-in for three apps",
    goal: "One account works across Guxo Flights, Guxo and Gexi.",
    how: "If all three apps use the same Supabase Auth project, a user has one identity everywhere. Each app keeps its own data tables, but they all trust the same user id. That's what makes shared points possible later.",
    steps: ["Draw the flows: sign up, log in, guest, reset password, log out.", "Decide: email + password and phone OTP; guest mode stays.", "Decide which Supabase project holds shared users (the Guxo Flights backend becomes the shared one).", "Write docs/auth.md."],
    done: ["Flows drawn and decisions written."] },
  { date: "2026-10-27", ms: "q1-4", priority: "high", title: "Supabase Auth in the app with secure session storage",
    goal: "The app can sign in with Supabase and keep the session safely.",
    how: "A session is a pair of tokens: a short-lived access token and a refresh token. They must be stored securely: expo-secure-store uses the phone's keychain/keystore instead of plain storage.",
    steps: ["Install @supabase/supabase-js and expo-secure-store.", "Create the Supabase client with a SecureStore storage adapter.", "Sign in with a test account from a debug button.", "Log the session and user id."],
    done: ["Sign-in works; restarting the app keeps you signed in."] },
  { date: "2026-10-28", ms: "q1-4", priority: "high", title: "Step-by-step sign-up on real auth",
    goal: "Your four-step sign-up creates a real account and profile.",
    how: "Auth stores login details; a profiles table stores everything else (name, address). A database trigger creates the profile row when a user signs up, the same pattern your dashboard uses.",
    steps: ["Create profiles table + RLS + on-signup trigger.", "Wire the sign-up steps to supabase.auth.signUp.", "Save name/address to the profile after sign-up.", "Handle 'email already registered'."],
    done: ["New account appears in Auth and profiles."] },
  { date: "2026-10-29", ms: "q1-4", priority: "high", title: "Log in with email or phone (OTP)",
    goal: "Users log in with an email password or a one-time code by SMS.",
    how: "OTP (one-time password) login sends a 6-digit code; the user proves they own the phone number. Supabase supports it with an SMS provider (use test phone numbers during development).",
    steps: ["Enable phone auth with test numbers in Supabase.", "Login screen: email + password, or phone → code screen.", "Friendly errors (wrong password, expired code).", "Remember the last method used."],
    done: ["Both login methods work."] },
  { date: "2026-10-30", ms: "q1-4", priority: "medium", title: "Friday: test, push, weekly notes",
    goal: "Ship the week.", how: "Test sign-up and login on the phone with fresh accounts, fix, push, reflect.",
    steps: ["Fresh sign-up and login on the phone.", "Fix and push.", "Weekly note."], done: ["Pushed; weekly note written."] },

  { date: "2026-11-02", ms: "q1-4", priority: "high", title: "Auth provider and protected screens",
    goal: "Screens that need an account only open when signed in.",
    how: "An AuthProvider listens to Supabase's auth state changes and shares the session via context. Navigation then shows either the signed-in stack or the auth stack. Guest mode is a third state.",
    steps: ["Create AuthProvider + useAuth hook.", "Switch navigation stacks on session / guest.", "Protect Trips, Profile and Checkout.", "Sign out returns to the start screen."],
    done: ["Protected screens are unreachable when signed out."] },
  { date: "2026-11-03", ms: "q1-4", priority: "high", title: "Password reset and email links into the app",
    goal: "Reset and confirmation emails open the app at the right screen.",
    how: "Deep links are URLs that open your app (guxoflights://reset). Expo Linking maps them to screens. Supabase puts tokens in the link, which the app uses to finish the reset.",
    steps: ["Configure the app scheme and Supabase redirect URLs.", "Handle the reset link: show 'new password' screen.", "Handle email confirmation.", "Test from a real email."],
    done: ["Reset works end to end from the email."] },
  { date: "2026-11-04", ms: "q1-4", priority: "high", title: "Profile screen on real data with RLS",
    goal: "Profile edits save to the database, only for the owner.",
    how: "RLS policies (user_id = auth.uid()) make the database refuse other users' rows even if the app has a bug. Test policies by trying to read another user's profile: it should return nothing.",
    steps: ["Load and save the profile.", "Upload an avatar to Supabase Storage (own folder only).", "Test with two accounts."],
    done: ["Edits persist; a second account can't see the first's profile."] },
  { date: "2026-11-05", ms: "q1-4", priority: "high", title: "Sessions: refresh, expiry and sign out everywhere",
    goal: "Sessions stay valid while in use and end cleanly.",
    how: "Access tokens expire (about an hour). The client refreshes them with the refresh token automatically, but only while the app is active. Handle the app returning from background and a revoked session.",
    steps: ["Enable auto-refresh on app foreground (AppState).", "Handle SIGNED_OUT / TOKEN_REFRESHED events.", "Add 'Sign out of all devices'.", "Test by revoking the session in Supabase."],
    done: ["Revoked sessions sign the app out gracefully."] },
  { date: "2026-11-06", ms: "q1-4", priority: "medium", title: "Friday: test, push, weekly notes",
    goal: "Ship the week.", how: "Test every auth path on the phone, fix, push, reflect.",
    steps: ["Test matrix: sign up, log in, reset, guest, sign out.", "Fix and push.", "Weekly note."], done: ["Pushed; weekly note written."] },

  { date: "2026-11-09", ms: "q1-4", priority: "high", title: "Move auth into a shared package",
    goal: "The auth code can be reused by Guxo and Gexi without copying.",
    how: "A shared package holds code used by several apps. Moving the Supabase client, AuthProvider, hooks and screens there means one fix fixes all three apps.",
    steps: ["Create a guxo-shared repo (or packages/shared in a monorepo).", "Move client, AuthProvider, useAuth and auth screens.", "Make screens themeable (brand colors per app).", "Export a clean API."],
    done: ["Guxo Flights runs with auth imported from the shared package."] },
  { date: "2026-11-10", ms: "q1-4", priority: "high", title: "Consume the shared package cleanly",
    goal: "Updating the shared package is a simple, repeatable step.",
    how: "Packages can be shared via npm workspaces (monorepo) or a git dependency with version tags. Versioning (1.0.0, 1.1.0) tells each app which shared code it runs.",
    steps: ["Pick monorepo workspaces or a git dependency; write why.", "Tag v1.0.0 of the shared package.", "Install it in guxo-flights-app by version.", "Document how to release a new version."],
    done: ["A change in shared → new version → updated in the app, documented."] },
  { date: "2026-11-11", ms: "q1-4", priority: "high", title: "One account across sibling apps",
    goal: "Design how a user sees they can use the same account in Guxo and Gexi.",
    how: "Because all apps share the auth project, signing in to Guxo with the same email just works. The profile page can list 'Your Guxo apps', and later 'Continue with your Guxo account'.",
    steps: ["Add an app_memberships table (user_id, app, joined_at).", "Record membership on first sign-in per app.", "Profile: 'Your Guxo apps' section.", "Write the cross-app rules in docs/auth.md."],
    done: ["Membership recorded; shown on the profile."] },
  { date: "2026-11-12", ms: "q1-4", priority: "high", title: "Security review of auth and data access",
    goal: "No secrets in the app, no table without RLS, no weak spots in sign-in.",
    how: "Security reviews use a checklist: secrets, access rules, input validation, rate limits. Supabase has built-in rate limits for auth and an advisor that flags tables without RLS.",
    steps: ["Run Supabase's security advisor; fix findings.", "Search the repo for keys/secrets.", "Check every table has RLS and policies.", "Review auth rate limits and password rules."],
    done: ["Advisor clean; checklist saved in docs/security.md."] },
  { date: "2026-11-13", ms: "q1-4", priority: "medium", title: "Friday: test, push, weekly notes",
    goal: "Ship the week.", how: "Test the app with the shared package on the phone, fix, push, reflect.",
    steps: ["Phone test.", "Fix and push.", "Weekly note."], done: ["Pushed; weekly note written."] },

  { date: "2026-11-16", ms: "q1-4", priority: "medium", title: "Sign in with Google and Apple (optional path)",
    goal: "Decide on social login and add it if worth it.",
    how: "Social login reduces sign-up friction. On iOS, if you offer any third-party login, Apple requires 'Sign in with Apple' too. Supabase supports both through OAuth.",
    steps: ["Decide yes/no (write why).", "If yes: configure Google and Apple providers.", "Add buttons with expo-auth-session / Apple authentication.", "Test on the phone."],
    done: ["Decision written; if yes, both work on the phone."] },
  { date: "2026-11-17", ms: "q1-4", priority: "high", title: "Polish and accessibility of the auth screens",
    goal: "Sign-in screens are clear, fast and accessible.",
    how: "Accessibility means everyone can use the app: labels for screen readers, enough contrast, tap targets of at least 44×44, and text that scales with the phone's font size.",
    steps: ["Add accessibilityLabel to inputs and buttons.", "Check contrast and tap sizes.", "Test with the phone's largest font and VoiceOver/TalkBack.", "Keyboard 'next' moves between fields."],
    done: ["Screens usable with a screen reader and large fonts."] },
  { date: "2026-11-18", ms: "q1-4", priority: "high", title: "Tests for the auth hooks and flows",
    goal: "Auth logic is covered by tests.",
    how: "Mock the Supabase client in tests so they run offline. Test the hook's state transitions (signed out → signed in → signed out) rather than Supabase itself.",
    steps: ["Mock the client.", "Test useAuth transitions and guest mode.", "Test form validation schemas.", "Write a manual test matrix for things tests can't cover."],
    done: ["Auth tests pass; matrix documented."] },
  { date: "2026-11-19", ms: "q1-4", priority: "medium", title: "Write the shared auth guide",
    goal: "Future you can add auth to Guxo and Gexi in an hour.",
    how: "Good docs are part of the product. A guide with setup steps, code snippets and gotchas turns a week of work into a repeatable recipe.",
    steps: ["docs/auth.md: setup, env vars, redirect URLs, package usage.", "Gotchas you hit this month.", "Diagram of the sign-in flow."],
    done: ["Guide complete in the shared repo."] },
  { date: "2026-11-20", ms: "q1-4", priority: "medium", title: "Friday: milestone demo and wrap-up",
    goal: "Finish the shared auth milestone.",
    how: "Prove it works, record it, write what you learned.",
    steps: ["Full auth demo on the phone.", "Record a 60-second video.", "Mark tasks done; weekly note."],
    done: ["Demo recorded; milestone at 100%."] },

  // ---- Milestone q1-5: shared points/promotions (Nov 23 - Dec 11) ----
  { date: "2026-11-23", ms: "q1-5", priority: "high", title: "Design the loyalty data model",
    goal: "A points model that is correct, auditable and shared by three apps.",
    how: "Never store 'balance' as a number you edit. Use a ledger: every earn or spend is a new row (+500, −200), and the balance is the sum. It's how banks work: you can always explain a balance.",
    steps: ["Draw tables: points_ledger, tiers, promotions, app memberships.", "Decide rules: earn rate, expiry, tiers (Bronze/Silver/Gold).", "Write docs/points.md with the diagram."],
    done: ["Model and rules written."] },
  { date: "2026-11-24", ms: "q1-5", priority: "high", title: "Create the points tables with RLS",
    goal: "The points tables exist and users can only read their own ledger.",
    how: "Users should read their points but never write them directly (they'd give themselves points). So: RLS allows select on own rows only; inserts happen only through server-side functions.",
    steps: ["Create points_ledger (user_id, app, amount, reason, ref, created_at).", "RLS: select own rows; no insert/update/delete for users.", "Balance view (sum by user).", "Test with two accounts."],
    done: ["Users can read but not write points."] },
  { date: "2026-11-25", ms: "q1-5", priority: "high", title: "Earn and redeem functions (atomic)",
    goal: "Points change only through safe server functions.",
    how: "A Postgres function with SECURITY DEFINER runs with elevated rights but only does one checked thing. Doing the balance check and the insert in one transaction prevents spending the same points twice.",
    steps: ["earn_points(app, amount, reason, ref).", "redeem_points(app, amount, ref): lock, check balance, insert negative row.", "Unique ref per booking (idempotency).", "Test double-spend attempts."],
    done: ["Balance never goes negative; the same booking can't earn twice."] },
  { date: "2026-11-26", ms: "q1-5", priority: "high", title: "Tiers and expiry",
    goal: "Users have a tier based on points earned, and old points expire.",
    how: "Tiers are derived from data (points earned in the last 12 months), so compute them in a view instead of storing them. Expiry can be a scheduled job that adds negative 'expired' rows.",
    steps: ["Tier thresholds table.", "View: tier per user.", "Expiry rule and a function to apply it.", "Schedule it (pg_cron) or document running it."],
    done: ["Tier shown correctly for test users; expiry adds rows."] },
  { date: "2026-11-27", ms: "q1-5", priority: "medium", title: "Friday: SQL tests, push, weekly notes",
    goal: "Ship the week with the database logic tested.",
    how: "Database logic deserves tests too: a SQL script that sets up users, calls the functions and checks results (like your dashboard's own database tests).",
    steps: ["Write tests/points.sql.", "Run it; fix issues.", "Push; weekly note."], done: ["SQL tests pass."] },

  { date: "2026-11-30", ms: "q1-5", priority: "high", title: "Promotions engine",
    goal: "Promotions (e.g. double points this week) apply automatically.",
    how: "A promotion is data, not code: a row with a multiplier, date range and which apps it applies to. earn_points looks up active promotions and multiplies, recording which promotion applied.",
    steps: ["promotions table (multiplier, starts, ends, apps).", "Apply in earn_points; record promotion_id.", "Seed a test promotion.", "Test inside/outside the date range."],
    done: ["Points double during an active promotion only."] },
  { date: "2026-12-01", ms: "q1-5", priority: "high", title: "Points API in the shared package",
    goal: "Every app gets points through the same small API.",
    how: "Wrap the RPC calls (supabase.rpc('earn_points')) in typed functions and hooks (usePoints) in the shared package, so each app just calls getBalance() or usePoints().",
    steps: ["getBalance, getHistory, usePoints hook.", "Types for ledger rows.", "Release shared v1.1.0.", "Update the app."],
    done: ["App reads points through the shared package."] },
  { date: "2026-12-02", ms: "q1-5", priority: "high", title: "Points screen on real data",
    goal: "Your existing Points screen shows the real ledger and tier.",
    how: "Replace mock data with the hooks. Show balance, tier progress and history, grouped by month.",
    steps: ["Wire balance and tier.", "History list with reasons and app icons.", "Empty state for new users."],
    done: ["Points screen shows real data."] },
  { date: "2026-12-03", ms: "q1-5", priority: "high", title: "Earn points when a booking is confirmed",
    goal: "Confirmed bookings earn points automatically, once.",
    how: "Earning must happen on the server when the booking is confirmed, not from the app (which a user could fake). A trigger or the confirmation function calls earn_points with the booking id as the unique ref.",
    steps: ["Call earn_points when a booking's status becomes confirmed.", "Use the booking id as ref.", "Test confirming twice."],
    done: ["Points appear once per confirmed booking."] },
  { date: "2026-12-04", ms: "q1-5", priority: "medium", title: "Friday: test, push, weekly notes",
    goal: "Ship the week.", how: "Test earning end to end on the phone, fix, push, reflect.",
    steps: ["Phone test.", "Fix and push.", "Weekly note."], done: ["Pushed; weekly note written."] },

  { date: "2026-12-07", ms: "q1-5", priority: "high", title: "Spend points at checkout",
    goal: "Users can use points as a discount, safely.",
    how: "Reserve points when the user applies them and finalise after payment succeeds. If payment fails, release them. This two-step pattern avoids losing points on failed payments.",
    steps: ["Points toggle at checkout with the discount shown.", "Reserve on apply; finalise on success; release on failure.", "Test failure paths."],
    done: ["Points are only spent on successful payments."] },
  { date: "2026-12-08", ms: "q1-5", priority: "medium", title: "Seed data and edge-case tests",
    goal: "Test users and promotions make demos and testing easy.",
    how: "A seed script creates realistic test data in one command, so every test starts from a known state.",
    steps: ["supabase/seed.sql: users, ledger rows, promotions.", "Edge cases: expiry boundary, tier boundary, zero balance.", "Document how to reset."],
    done: ["One command gives a demo-ready database."] },
  { date: "2026-12-09", ms: "q1-5", priority: "high", title: "Ready for three apps",
    goal: "The points system is truly shared across apps.",
    how: "An app column on every ledger row lets you report per app while balances stay shared. Promotions can target one app or all.",
    steps: ["Enforce valid app values.", "Per-app report view.", "Promotion targeting by app.", "Document how Guxo and Gexi will plug in."],
    done: ["Reports per app work; docs updated."] },
  { date: "2026-12-10", ms: "q1-5", priority: "medium", title: "Document the points system",
    goal: "A clear write-up and diagram of the points system.",
    how: "This is also case-study material: explaining the ledger design shows engineering maturity to employers.",
    steps: ["Finish docs/points.md with diagrams.", "Explain ledger vs balance, atomic spend, promotions.", "Add to the portfolio notes."],
    done: ["Docs complete."] },
  { date: "2026-12-11", ms: "q1-5", priority: "medium", title: "Friday: milestone demo and wrap-up",
    goal: "Finish the points milestone.", how: "Prove it, record it, reflect.",
    steps: ["Demo earn, promotion, spend on the phone.", "Record a video.", "Mark tasks done; weekly note."],
    done: ["Demo recorded; milestone at 100%."] },

  // ---- Milestone q1-6: real end-to-end booking (Dec 14 - Dec 23) ----
  { date: "2026-12-14", ms: "q1-6", priority: "high", title: "Booking as a state machine",
    goal: "Every booking moves through clear, valid states.",
    how: "A state machine lists the allowed states (draft → priced → awaiting payment → confirmed → cancelled) and transitions. It prevents impossible situations like confirming an unpaid booking.",
    steps: ["Write the states and allowed transitions.", "Enforce them in a database function (update_booking_status).", "Walk the whole flow and list gaps."],
    done: ["Invalid transitions are rejected."] },
  { date: "2026-12-15", ms: "q1-6", priority: "urgent", title: "Payments in test mode",
    goal: "Users can pay with a test card.",
    how: "Card data must never touch your server. Stripe's PaymentSheet collects it; your Edge Function creates a PaymentIntent with the secret key and returns a client secret the app uses to confirm.",
    steps: ["Stripe test account; secret key in function secrets.", "Edge Function: create PaymentIntent for the booking total.", "@stripe/stripe-react-native PaymentSheet in checkout.", "Pay with test card 4242…"],
    done: ["Test payment succeeds in the app."] },
  { date: "2026-12-16", ms: "q1-6", priority: "urgent", title: "Confirm bookings from the payment webhook",
    goal: "A booking is confirmed only when the payment provider says it's paid.",
    how: "The app can't be trusted to say 'I paid'. Stripe calls your webhook (a server endpoint) when payment succeeds; the webhook verifies the signature and moves the booking to confirmed, which also earns points.",
    steps: ["Webhook Edge Function with signature check.", "On success: status confirmed + booking reference.", "Confirmation screen polls or subscribes to the status.", "Test with Stripe CLI events."],
    done: ["Paid bookings confirm; fake requests are rejected."] },
  { date: "2026-12-17", ms: "q1-6", priority: "high", title: "Trips screen and cancellations",
    goal: "Users see their real bookings and can cancel.",
    how: "Trips reads the user's bookings (RLS keeps them private). Cancelling is another state transition that refunds and reverses points.",
    steps: ["Trips list on real data (upcoming/past).", "Booking details with reference.", "Cancel: refund in test mode, reverse points, status cancelled."],
    done: ["Cancel works end to end."] },
  { date: "2026-12-18", ms: "q1-6", priority: "medium", title: "Friday: full test, push, weekly notes",
    goal: "Ship the week.", how: "Book, pay, confirm, cancel on the phone.",
    steps: ["Full flow test.", "Fix and push.", "Weekly note."], done: ["Pushed; weekly note written."] },
  { date: "2026-12-21", ms: "q1-6", priority: "high", title: "Unhappy paths",
    goal: "Every failure in booking has a clear, safe outcome.",
    how: "List what can go wrong: card declined, price changed, session expired, network drop during payment. For each: what the user sees and what the data looks like afterwards.",
    steps: ["Test each failure deliberately.", "Fix messages and states.", "Make sure no failure leaves a paid-but-unconfirmed booking."],
    done: ["All failure cases handled and documented."] },
  { date: "2026-12-22", ms: "q1-6", priority: "medium", title: "Demo video and case study update",
    goal: "Show the end-to-end booking in your portfolio.",
    how: "A short demo plus an updated case study turns months of work into something employers can see in 2 minutes.",
    steps: ["Record the full booking flow.", "Update the Guxo Flights case study and README.", "Push."],
    done: ["Video and case study updated."] },
  { date: "2026-12-23", ms: "q1-6", priority: "medium", title: "Quarter review and January plan",
    goal: "Close the foundation quarter and set up Q1 2027.",
    how: "Reviews turn experience into lessons. Look at the numbers (Quarter page), what slipped and why, then plan January's daily tasks.",
    steps: ["Quarter page: scores, milestones, what slipped.", "Write the quarter notes.", "Ask your PM (Claude) to break January into daily tickets.", "Rest until Jan 4."],
    done: ["Quarter notes written; January planned."] },
];

function describeTicket(t) {
  return [
    `Goal: ${t.goal}`,
    `How it works: ${t.how}`,
    `Steps:\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `Done when:\n${t.done.map((d) => `- ${d}`).join("\n")}`,
  ].join("\n\n");
}

function describeMilestone(m) {
  const parts = [];
  if (m.description) parts.push(m.description);
  if (m.weeks) parts.push("Week-by-week plan (broken into daily tickets at the start of the month):\n" +
    m.weeks.map(([wk, text]) => `- Week of ${wk}: ${text}`).join("\n"));
  return parts.join("\n\n") || null;
}

/** Pulls one section ("How it works", "Goal"...) out of a ticket description. */
export function ticketSection(description, name) {
  if (!description) return null;
  const re = new RegExp(`(?:^|\\n\\n)${name}:\\s*([\\s\\S]*?)(?=\\n\\n(?:Goal|How it works|Steps|Done when):|$)`);
  const m = re.exec(description);
  return m ? m[1].trim() : null;
}

/**
 * Builds the year plan as database rows.
 *   newId: makes ids so rows can reference each other.
 *   roadmapDone: { "q1-1": true, ... } from the original roadmap checklists,
 *   so finished milestones stay finished.
 */
export function buildYearPlan(newId, roadmapDone = {}) {
  const goalIds = {}, msIds = {};
  const goals = GOALS.map((g) => {
    goalIds[g.key] = newId();
    return { id: goalIds[g.key], title: g.title, description: g.description, quarter: g.quarter, year: g.year,
      deadline: g.deadline, progress_mode: "milestones", status: "not_started", target: 100, current_progress: 0 };
  });
  const milestones = MILESTONES.map((m) => {
    msIds[m.id] = newId();
    const done = !!roadmapDone[m.id];
    return {
      id: msIds[m.id], goal_id: goalIds[m.goal], title: m.title, description: describeMilestone(m),
      category: m.category, priority: m.priority, start_date: m.start, deadline: m.deadline,
      // Finished roadmap items keep a simple done/not-done count; the rest
      // track their progress from their tasks.
      progress_mode: done ? "manual" : "tasks", target: 1, current_progress: done ? 1 : 0,
      status: done ? "completed" : "not_started",
    };
  });
  const tasks = TICKETS.map((t) => ({
    id: newId(), title: t.title, description: describeTicket(t), date: t.date,
    due_date: addDays(t.date, 4 - weekdayIndex(t.date)), // Friday of that week
    priority: t.priority, status: "not_started", completion_percentage: 0,
    category: MILESTONES.find((m) => m.id === t.ms).category, estimated_minutes: 180, milestone_id: msIds[t.ms],
  }));
  return { goals, milestones, tasks };
}

export const PLAN_STATS = { tickets: TICKETS.length, milestones: MILESTONES.length, goals: GOALS.length,
  first: TICKETS[0].date, last: TICKETS[TICKETS.length - 1].date };
