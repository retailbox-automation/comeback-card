// Dev-only: the card screen with the picture's sample data, for side-by-side comparison with the chosen picture.
// Served by the dev server at /preview.html; not part of the build.
import { createRoot } from 'react-dom/client';
import '../src/ui/theme.css';
import '../src/ui/cc/cc.css';
import { Banner } from '../src/ui/common';
import { CardScreen } from '../src/ui/cc/CardScreen';

const noop = () => {};

function App() {
  return (
    <div className="cc-card-page">
      <Banner />
      <CardScreen
        net="mainnet"
        shopName="Maple Street Coffee (demo)"
        shopSubtitle="Demo shop"
        demoShop
        balance="$0.80"
        balanceLine="left of $1.00 · use by Nov 30, 2026"
        left={0.8}
        comeback={{ kind: 'promise', text: 'After Nov 30 it can only go back to the giver. Anyone can send it back, no wallet needed.' }}
        pay={{
          kind: 'ready',
          chips: [
            { key: 'a', label: '$0.25', on: true, onPick: noop },
            { key: 'b', label: '$0.50', on: false, onPick: noop },
            { key: 'all', label: 'All', on: false, onPick: noop },
          ],
          buttonLabel: 'Pay $0.25 at Maple Street Coffee',
          busy: false,
          canPay: true,
          onPay: noop,
        }}
        activity={[
          { key: '1', text: '−$0.15 · Paid at Maple Street Coffee', txid: '7721b3d31bced75368f280207f0c717966c8cff9ae5e7aa61dd4f8566e6c4fed', confirmed: true, height: 977412 },
          { key: '2', text: '−$0.05 · Paid at Maple Street Coffee', txid: '066a06f29a47a1be98402a529defdb55f5aa9eb8e23c8d8762ffe82314057f43', confirmed: false, height: 0 },
        ]}
        onCashOut={noop}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
