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


//For this, I only integrated phantom - we probably want more wallets integrated 
// https://github.com/solana-labs/wallet-adapter <- might be helpful
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

//this will be "mainnet-beta" not "devnet" for production
const NETWORK = clusterApiUrl("devnet");

function App() {
  const [provider, setProvider] = useState<PhantomProvider | undefined>(undefined);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  //I'll send you different vals for these wallets/programId for production
  const houseWallet = new PublicKey("HE1XMz6fJUWszf1XMyEPG8c4M6HpjMxyVPUHqp9CDR33");
  const feeWallet = new PublicKey ("3wZP62kiHGDqFpN8GQ2Xk67UYdpqPsK7WTGGrHydYM9v");
  const programId = new PublicKey("Dxrbup3i6wCZabtFzAPPqJkcSnvSZBfpFipUZdqWVqhw");

  const connection = new Connection(NETWORK);
  const [, setConnected] = useState<boolean>(false);

  //logs stuff I just used to print out transaction signatures on screen for demo
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = useCallback(
    (log: string) => setLogs((logs) => [...logs, "> " + log]),
    []
  );

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
  
    /*
    data_array is paramaters for smart contract 
    first element is the instruction id - 0 is placing a bet so that should always be 0
    I will be changing the contract a little bit from what this demo was 
    prob isn't needed anymore (we're fixing it at 50)
    heads || tails is needed 
    In production data_array would be [0, 0] for heads bet [0, 1] for tails bet
    */
    var data_array = new Uint8Array([0, prob]);
    const data: Buffer = Buffer.from(data_array.buffer);
    /*
    transaction has 2 parts 
    1 - createAccount
          this creates a new temporary account and send the users bet to it 
          fromPubkey - where the $$ is coming from (user wallet from wallet provider)
          newAccountPubkey - the public key of the new account (generated in sendTransaction)
          lamports - amount of $$ to transfer (in lamports, 1 billion lamports = 1 sol)
          space - should be the size (kb) of the new account so blockchain can allocate space - I was lazy and just hardcoded more than needed here
          programId - the smart contracts programId - this makes the program own this temporary wallet so it can interact with the $$
    2 - TransactionInstruction
          keys - must list EVERY account the program is going to touch - in our case it is just the 4 listed below
          programId - the smart contracts programId to send instruction to 
          data - the data buffer from above
    */ 
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
//ensure transaction fees are paid by the user
    transaction.feePayer = provider.publicKey; 
    const anyTransaction: any = transaction; 
    anyTransaction.recentBlockhash = (
      await connection.getRecentBlockhash()
    ).blockhash;

    return transaction; 
  }

  //ignore this - only works on devnet
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
      //generate keypair for tempwallet
      const tempWallet = new Keypair();
      //create the transaction object
      const transaction = await createBetTransaction(prob, amount, tempWallet); 
      if (!transaction) return; 
      //sign the transaction 
      let signed = await provider!.signTransaction(transaction);
      console.log("Got signature, submitting transaction");
      //transaction sent - await signature 
      let signature = await connection.sendRawTransaction(signed.serialize());
      addLog("Transaction Signature: " + signature);
      //confirm transaction completed 
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
