import './App.css';
import {
  Connection, 
  SystemProgram, 
  Transaction, 
  PublicKey, 
  TransactionInstruction, 
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import {useCallback, useEffect, useState} from 'react';
import {Buffer} from 'buffer';
global.Buffer = Buffer;

type DisplayEncoding = "utf8" | "hex";
type PhantomEvent = "disconnect" | "connect" | "accountChanged";
type PhantomRequestMethod = 
    | "connect"
    | "disconnect" 
    | "signTransaction"
    | "signAllTransactions"
    | "signMessage";

    
interface ConnectOpts {
  onlyIfTrusted: boolean; 
}

interface PhantomProvider {
  publicKey: PublicKey | null; 
  isConnected: boolean | null; 
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage: (
      message: Uint8Array | string, 
      display?: DisplayEncoding
  ) => Promise<any>;
  connect: (opts?: Partial<ConnectOpts>) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>; 
  on: (event: PhantomEvent, handler: (args: any) => void) => void; 
  request: (method: PhantomRequestMethod, params: any) => Promise<unknown>;
}

const NETWORK = clusterApiUrl("devnet");

function App() {
  const [provider, setProvider] = useState<PhantomProvider | undefined>(undefined);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const houseWallet = new PublicKey("HE1XMz6fJUWszf1XMyEPG8c4M6HpjMxyVPUHqp9CDR33");
  const feeWallet = new PublicKey ("3wZP62kiHGDqFpN8GQ2Xk67UYdpqPsK7WTGGrHydYM9v");
  const programId = new PublicKey("Dxrbup3i6wCZabtFzAPPqJkcSnvSZBfpFipUZdqWVqhw");

  const connection = new Connection(NETWORK);
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = useCallback(
    (log: string) => setLogs((logs) => [...logs, "> " + log]),
    []
  );
   
  const [, setConnected] = useState<boolean>(false);

  const getProvider = (): PhantomProvider | undefined => {
    if ("solana" in window) {
      // @ts-ignore
      const provider = window.solana; 
      if (provider.isPhantom) {return provider as PhantomProvider};
    }
    window.open("https://phantom.app/", "_blank");
  }

  const connectWallet = async () => { 
      try {
        await provider?.connect(); 
      } catch (e) {
        console.log(e);
      }
    }

  const disconnectWallet = async () => {
    // @ts-ignore
    const { solana } = window; 
    if (publicKey && solana ) {
      await (solana as PhantomProvider).disconnect();
      setPublicKey(null);
    }
  }

  useEffect(() => {
    const provider = getProvider();    
    if (provider) {
      setProvider(provider);
      provider.on("connect", (publicKey: PublicKey) => {
        setPublicKey(publicKey);
        setConnected(true);
        console.log("[connect] " + publicKey?.toBase58());
      });
    } else { 
      console.log("no provider found");
      setProvider(undefined); }
  }, []);

  const onClickHalf = async () => {
    await sendTransaction(50, 0.5 * LAMPORTS_PER_SOL);
  }

  const onClickOne = async () => {
    await sendTransaction(50, 1 * LAMPORTS_PER_SOL);
  }

  const createBetTransaction = async (prob: number, amount: number, tempWallet: Keypair) => {
    if (!provider?.publicKey) return; 
  
    var data_array = new Uint8Array([0, prob]);
    const data: Buffer = Buffer.from(data_array.buffer);
    let transaction = new Transaction()
    .add(
      SystemProgram.createAccount({
          fromPubkey: provider?.publicKey!,
          newAccountPubkey: tempWallet.publicKey,
          lamports: amount, 
          space: 1024, 
          programId: programId
      })
    ).add(
    new TransactionInstruction({
      keys: [{isSigner: true, isWritable: true, pubkey: provider?.publicKey!},
        {isSigner: false, isWritable: true, pubkey: tempWallet.publicKey}, 
        {isSigner: false, isWritable: true, pubkey: feeWallet}, 
        {isSigner: false, isWritable: true, pubkey: houseWallet},], 
      programId, 
      data: data
    })
);
    transaction.feePayer = provider.publicKey; 
    const anyTransaction: any = transaction; 
    anyTransaction.recentBlockhash = (
      await connection.getRecentBlockhash()
    ).blockhash;

    return transaction; 
  }

  const airdrop = async () => {
    let airdropSignature = await connection.requestAirdrop(
      provider?.publicKey!,
      1.5 * LAMPORTS_PER_SOL,
    );
    console.log("Airdrop Transaction Signature:", airdropSignature);
    await connection.confirmTransaction(airdropSignature);
  }

  const sendTransaction = async (prob: number, amount: number) => {
    try {
      const tempWallet = new Keypair();
      const transaction = await createBetTransaction(prob, amount, tempWallet); 
      if (!transaction) return; 
      let signed = await provider!.signTransaction(transaction);
      console.log("Got signature, submitting transaction");
      transaction.partialSign(tempWallet);
      let signature = await connection.sendRawTransaction(signed.serialize());
      addLog("Transaction Signature: " + signature);
      await connection.confirmTransaction(signature);
    } catch (e) {
      console.log(e);
      console.log("[error] sendTransaction: " + JSON.stringify(e));
    }
  }
  return (
    <body background-image="TTBackground.png">
    <div className="app-body">
      <div className="app-body-top">
        <img src="TokenTippers.png" className="logo"alt="Token Tippers Logo" style={{width: "40%", height: "40%", margin: "auto"}}></img><br></br>
        {provider && publicKey ? (
          <>
            <button 
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              padding: "30px",
              borderRadius: "10px",
            }}
            onClick={disconnectWallet}
            >Disconnect from Phantom</button>
            </>
        ) : (
          <>
          <button
          style={{
            fontSize: "20px",
            padding: "30px",
            fontWeight: "bold",
            borderRadius: "10px",
          }}
          onClick={connectWallet}
          > Connect to Phantom
          </button>
          </>
        )}
      </div>
      {provider && publicKey && (
        <div>
          <button className="half-sol-bet" type="button" onClick={onClickHalf} style={{
            fontSize: "24px",
            padding: "20px",
            borderRadius: "10px",
          }}>
                    Bet 0.5 Sol
          </button>
          <button className="one-sol-bet" type="button" onClick={onClickOne} style={{
            fontSize: "24px",
            padding: "20px",
            borderRadius: "10px",
          }}>
                    Bet 1 Sol
          </button>
        </div>
      )}
      {provider && publicKey && (
      <div>
          <button className="airdrop" type="button" onClick={airdrop} style={{
            fontSize: "24px",
            padding: "20px",
            borderRadius: "10px",
          }}>
            Request 1.5 Sol Airdrop
          </button>
        </div>)}
        <footer className="logs">
          {logs.map((log, i) => (
            <div className="log" key={i}>
              {log}
            </div>
          ))}
        </footer>
    </div>
    </body>
  );
}

export default App;
