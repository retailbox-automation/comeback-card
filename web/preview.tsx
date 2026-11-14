// Dev-only preview (not in the build, see vite.config.ts): every screen state drawn with fixtures, using the
// same presentational components as the live pages. Used to compare the pages with the chosen pictures.
// Open http://127.0.0.1:5173/preview.html and pick a frame; #<frame> renders that frame alone.
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import './preview.css';
import { Banner, Footer } from '../src/ui/common';
import { NetworkRail } from '../src/ui/NetworkRail';
import { CreateCard, CreateForm, CreatePreviewRows, HomeHero, HowItWorks, MyCampaigns, WalletLine } from '../src/ui/screens/home';
import { StampScreen, type StampView } from '../src/ui/screens/stamp';
import { CampaignScreen, type CampaignRowView } from '../src/ui/screens/campaign';
import { CounterScreen } from '../src/ui/screens/counter';
import { EXPIRED_TEXT } from '../src/core/view';

// Sample values only. Transaction ids below are made up for the preview and lead nowhere.
const NET = 'mainnet' as const;
const SHOP = 'Maple Street Coffee (demo)';
const TX = (seed: string) => (seed.repeat(64).slice(0, 64));
const NODE_WORDS = 'mandatory-script-verify-flag-failed (Script failed an OP_EQUALVERIFY operation)';
const noop = () => {};

function CreateConnected() {
  return (
    <CreateCard>
      <CreateForm
        shopMode="demo"
        onShopMode={noop}
        demoShopName={SHOP}
        ownShop=""
        onOwnShop={noop}
        ownShopName=""
        onOwnShopName={noop}
        ownShopError={null}
        addressPlaceholder="bitcoincash:q…"
        usd={0.25}
        usdOptions={[0.25, 0.5, 1]}
        onUsd={noop}
        usdDisabled={false}
        count={2}
        countOptions={[1, 2, 3, 4, 5, 10]}
        onCount={noop}
        days={7}
        dayOptions={[
          { days: 1, label: 'Nov 14, 2026' },
          { days: 7, label: 'Nov 20, 2026' },
          { days: 30, label: 'Dec 13, 2026' },
        ]}
        onDays={noop}
        campaignName="Newcomers Night"
        onCampaignName={noop}
        buttonLabel="Create 2 stamps"
        canCreate
        onCreate={noop}
        details="One transaction on Bitcoin Cash mainnet, network fee about $0.001. (sample)"
        wallet={{ name: 'Cashonize', balance: '488,085 sats', onRefresh: noop }}
      />
    </CreateCard>
  );
}

function CreateIdle() {
  return (
    <CreateCard>
      <CreatePreviewRows shopName={SHOP} expiryDay="Nov 21, 2026" />
      <button type="button" className="btn btn-primary btn-create">Connect wallet</button>
      <WalletLine connected={false} text="WizardConnect: Selene (2026.10 or newer), Cashonize or Paytaca" />
    </CreateCard>
  );
}

function Home({ idle }: { idle?: boolean }) {
  return <HomeHero net={NET} create={idle ? <CreateIdle /> : <CreateConnected />} preview={{ shopName: SHOP, amount: '$0.25' }} refuseHref="#refuse" />;
}

function HomePage({ idle }: { idle?: boolean }) {
  return (
    <div className="home">
      <Banner />
      <Home idle={idle} />
      <NetworkRail amount="$0.25" shopName="Maple Street Coffee" refuseHref="#refuse" />
      <MyCampaigns list={[]} />
      <HowItWorks refuseId="refuse" yourStamps={[]} />
      <Footer />
    </div>
  );
}

const STAMP_SHOP = { name: SHOP, subtitle: 'Demo shop', demo: true };
const READY: StampView = {
  kind: 'ready',
  expired: false,
  expiryShort: 'Nov 20',
  expiryDay: 'Nov 20, 2026',
  expiredText: '',
  buyLabel: 'Buy · $0.25',
  buying: false,
  onBuy: noop,
  onTryElsewhere: noop,
};
const STATES: Array<{ label: string; view: StampView }> = [
  { label: '1 Stamp', view: READY },
  { label: '2 Paid', view: { kind: 'paid', txid: TX('3fd5d78b'), confirmed: false, height: null, received: null, counterHref: '#counter-page' } },
  {
    label: '3 Sent elsewhere',
    view: {
      kind: 'elsewhere',
      to: 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a',
      onTo: noop,
      placeholder: 'bitcoincash:q… (your own wallet)',
      busy: false,
      canSend: true,
      onSend: noop,
      onBack: noop,
      result: { kind: 'rejected', nodeError: NODE_WORDS, why: 'The contract only lets this stamp pay Maple Street Coffee. Your stamp is untouched.' },
    },
  },
  { label: '4 Expired', view: { ...READY, expired: true, expiredText: EXPIRED_TEXT } },
];

const MORE = (
  <>
    <h2>Why can’t this stamp be sent anywhere else?</h2>
    <p>
      The coins sit in a tiny Bitcoin Cash contract. Its rule: the money may go to exactly one address, <span className="addr">bitcoincash:qzyqzwa3nhn543a5x2zyqgr4djmj65h3pv3je90tf0</span>, minus a
      capped fee. Every node checks that rule.
    </p>
    <p>The key for this stamp lives only in this link (after the #). Browsers never send that part to any server.</p>
  </>
);

function Stamp({ i, page }: { i: number; page?: boolean }) {
  const s = STATES[i]!;
  const screen = <StampScreen net={NET} shop={STAMP_SHOP} amount="$0.25" view={s.view} more={page ? MORE : undefined} />;
  if (!page) return <div className="pvw-single">{screen}</div>;
  return (
    <div className="stamp-page">
      <Banner />
      {screen}
      <Footer />
    </div>
  );
}

function Phones() {
  const lefts = [32, 468, 906, 1343];
  return (
    <div className="pvw-phones" data-frame="phones">
      {STATES.map((s, i) => (
        <div key={s.label}>
          <div className="pvw-phone" style={{ left: lefts[i] }}>
            <div className="pvw-phone-screen">
              <StampScreen net={NET} shop={STAMP_SHOP} amount="$0.25" view={s.view} />
            </div>
          </div>
          <div className="pvw-phone-label" style={{ left: lefts[i] }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROWS: CampaignRowView[] = [
  { n: 12, tone: 'spent', when: 'block 291,412' },
  { n: 11, tone: 'spent', when: 'block 291,411' },
  { n: 3, tone: 'returned', when: 'no block yet' },
  { n: 10, tone: 'spent', when: 'block 291,409' },
  { n: 9, tone: 'spent', when: 'block 291,408' },
  { n: 8, tone: 'spent', when: 'block 291,406' },
].map(({ n, tone, when }) => ({
  key: String(n),
  tone: tone as 'spent' | 'returned',
  title: tone === 'spent' ? `Stamp #${n} spent at Maple Street Coffee` : `Stamp #${n} returned to the sponsor`,
  amount: '$0.25',
  amountTitle: '48,250 sats (sample)',
  pill: tone === 'spent' ? { label: 'confirmed', tone: 'green' as const } : { label: '0-conf', tone: 'outline' as const },
  when,
  tx: { txid: TX(String(n).padStart(2, '0') + 'ab'), label: 'view' },
}));

function Campaign() {
  return (
    <CampaignScreen
      net={NET}
      name="Newcomers Night"
      sampleData
      sponsor={{ label: 'qpg22…7jwvh', title: 'bitcoincash:qpg228tg5gdnuaqvk78kr7jdureu4gpywsd437jwvh' }}
      shopName={SHOP}
      showPhoto
      counts={{ spent: 41, returned: 9, waiting: 0, total: 50 }}
      rows={ROWS}
      footnote="Counts stamps spent at the shop’s address. A shop could spend stamps itself — same risk as a paper coupon."
    />
  );
}

function Counter() {
  const tx = TX('c268c162');
  return (
    <CounterScreen
      net={NET}
      shopName={SHOP}
      address="bitcoincash:qzyqzwa3nhn543a5x2zyqgr4djmj65h3pv3je90tf0"
      focus={{ txid: tx, amount: '$0.25', sats: '48,250 sats', fromStamp: true, confirmed: false, height: 0, highlight: true, label: 'This payment' }}
      payments={[
        { txid: tx, amount: '$0.25', fromStamp: true, confirmed: false, height: 0, highlight: true },
        { txid: TX('7a91'), amount: '$0.25', fromStamp: true, confirmed: true, height: 291412, highlight: false },
        { txid: TX('b0e3'), amount: '$0.25', fromStamp: true, confirmed: true, height: 291409, highlight: false },
      ]}
    />
  );
}

function B3() {
  return (
    <div className="pvw-b3" data-frame="b3">
      <div className="pvw-window">
        <Campaign />
      </div>
      <div className="pvw-tablet">
        <div className="pvw-tablet-screen">
          <Counter />
        </div>
      </div>
    </div>
  );
}

function Page({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <div className={cls}>
      <Banner />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

const FRAMES: Record<string, { title: string; render: () => ReactNode }> = {
  home: { title: 'Home hero, wallet connected (B1)', render: () => <Home /> },
  'home-page': { title: 'Home, whole page with the rail', render: () => <HomePage /> },
  'home-idle-page': { title: 'Home, whole page, no wallet yet', render: () => <HomePage idle /> },
  rail: { title: 'Rail alone (C1)', render: () => <div className="pvw-rail"><NetworkRail amount="$0.25" shopName="Maple Street Coffee" refuseHref="#refuse" /></div> },
  phones: { title: 'Stamp, four states in phones (B2)', render: () => <Phones /> },
  'stamp-1': { title: 'Stamp screen 1', render: () => <Stamp i={0} /> },
  'stamp-2': { title: 'Stamp screen 2 (paid)', render: () => <Stamp i={1} /> },
  'stamp-3': { title: 'Stamp screen 3 (sent elsewhere)', render: () => <Stamp i={2} /> },
  'stamp-4': { title: 'Stamp screen 4 (expired)', render: () => <Stamp i={3} /> },
  'stamp-1-page': { title: 'Stamp page 1 with banner', render: () => <Stamp i={0} page /> },
  'stamp-2-page': { title: 'Stamp page 2 with banner', render: () => <Stamp i={1} page /> },
  'stamp-3-page': { title: 'Stamp page 3 with banner', render: () => <Stamp i={2} page /> },
  'stamp-4-page': { title: 'Stamp page 4 with banner', render: () => <Stamp i={3} page /> },
  b3: { title: 'Campaign + counter tablet (B3)', render: () => <B3 /> },
  'campaign-page': { title: 'Campaign page (sample data)', render: () => <Page cls="campaign-page"><Campaign /></Page> },
  'counter-page': { title: 'Counter page', render: () => <Page cls="counter-page"><Counter /></Page> },
};

function App() {
  const key = location.hash.replace(/^#/, '');
  const frame = FRAMES[key];
  if (!frame) {
    return (
      <div className="pvw-index">
        <h1>Preview frames (dev only, sample data)</h1>
        <ul>
          {Object.entries(FRAMES).map(([k, f]) => (
            <li key={k}>
              <a href={`#${k}`}>{k}</a>{' '}
              — {f.title}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <>{frame.render()}</>;
}

window.addEventListener('hashchange', () => location.reload());
createRoot(document.getElementById('root')!).render(<App />);
