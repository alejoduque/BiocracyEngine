import asyncio
import math
import os
from collections import deque
from web3 import Web3
from pythonosc import udp_client

# Configuration
# Using HTTP provider since we can't use the pending filter with Infura.
# ETH_NODE_URL env var overrides (keeps the API key out of new deployments);
# defaults preserve existing start_ecosystem.sh behaviour unchanged.
ETH_NODE_URL = os.environ.get(
    "ETH_NODE_URL",
    "https://mainnet.infura.io/v3/76a669b9a1fe48f7b8a7e145d76bf95d",
)
OSC_IP = os.environ.get("ETH_OSC_IP", "127.0.0.1")  # audio machine
OSC_PORT = int(os.environ.get("ETH_OSC_PORT", "57120"))  # SuperCollider port

# Create Web3 connection with HTTP provider
w3 = Web3(Web3.HTTPProvider(ETH_NODE_URL))

# Create OSC client
osc_client = udp_client.SimpleUDPClient(OSC_IP, OSC_PORT)

# Map Ethereum value to a musical note (MIDI note)
def map_value_to_note(value, min_note=36, max_note=84):
    # Convert Wei to Ether
    ether_value = float(w3.from_wei(value, 'ether'))

    if ether_value <= 0:
        return min_note

    # Log scale tuned for typical ETH TX range (0.0001 to 100 ETH)
    # log10(0.0001)=-4, log10(0.01)=-2, log10(1)=0, log10(100)=2
    log_val = math.log10(ether_value)
    # Map -4..2 → 0..1
    normalized = max(0.0, min(1.0, (log_val + 4.0) / 6.0))

    note = min_note + normalized * (max_note - min_note)
    return int(note)

# Map gas to velocity/volume.
#
# The old version normalized (gwei - 10) / 300, a window calibrated for 2021-era
# mainnet. Post-Dencun base fees sit far below 10 gwei, so EVERY transaction
# clamped to min_vel and velocity was a constant 30 — one whole expressive
# dimension permanently dead.
#
# What actually carries information is not the absolute price but how far a
# sender bid ABOVE the block's base fee: "how badly did this actor want in".
# That ratio is self-calibrating — it stays alive whether the base fee is
# 0.3 gwei or 300 — so this mapping cannot silently go flat again when the gas
# regime shifts.
def map_gas_to_velocity(gas_price, base_fee=None, min_vel=30, max_vel=120):
    gas_gwei = float(w3.from_wei(gas_price, 'gwei'))
    if base_fee:
        base_gwei = float(w3.from_wei(base_fee, 'gwei'))
        # Priority ratio: 1.0 = paid exactly base fee, 3.0 = bid 3x over.
        ratio = gas_gwei / base_gwei if base_gwei > 0 else 1.0
        # log2 over 1x..8x -> 0..1. Most blocks live in 1.0-2.0, which lands
        # mid-range and leaves headroom for genuine priority spikes.
        normalized = min(1.0, max(0.0, math.log2(max(1.0, ratio)) / 3.0))
    else:
        # No base fee available (pre-EIP-1559 tx, or a node that omits it):
        # fall back to a log window across 0.1..100 gwei, still never flat.
        normalized = min(1.0, max(0.0, (math.log10(max(0.1, gas_gwei)) + 1.0) / 4.0))
    return int(min_vel + normalized * (max_vel - min_vel))


# Stable small integer identity for an address. Used by the "address as voice"
# rhythm scheme: the same counterparty returns as the same voice, so a long
# listen lets you recognise recurring actors rather than hearing undifferentiated
# events. Python's hash() is salted per process, so derive it deterministically.
def address_signature(addr):
    if not addr:
        return 0
    h = 2166136261
    for ch in str(addr).lower():
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h % 1024

# Generate instrument based on transaction type
def get_instrument(tx_data):
    # Check if it's a contract interaction
    if tx_data.get('input') and tx_data['input'] != '0x':
        return 2  # Some other instrument for contracts
    else:
        return 1  # Basic instrument for regular transactions

# Poll for new blocks and transactions
async def poll_transactions(poll_interval=3):
    print(f"Starting to poll for new blocks every {poll_interval} seconds...")
    last_block_num = w3.eth.block_number
    print(f"Current block: {last_block_num}")

    # Track processed transaction hashes to avoid duplicates.
    # deque evicts OLDEST first — the previous set-slicing kept an arbitrary
    # half of the entries (set order is undefined), so recent hashes could be
    # evicted and replayed while stale ones survived.
    processed_txs = set()
    processed_order = deque()
    MAX_PROCESSED = 1000

    # Define minimum value threshold (0.0001 ETH)
    min_value_threshold = w3.to_wei(0.0001, 'ether')
    print(f"Minimum transaction value threshold: {w3.from_wei(min_value_threshold, 'ether')} ETH")

    while True:
        try:
            current_block_num = w3.eth.block_number

            # If we have new blocks
            if current_block_num > last_block_num:
                print(f"New block(s) detected! Processing from {last_block_num+1} to {current_block_num}")

                # Process each new block
                for block_num in range(last_block_num + 1, current_block_num + 1):
                    try:
                        # Get block with full transaction objects
                        block = w3.eth.get_block(block_num, full_transactions=True)
                        print(f"Block {block_num} has {len(block['transactions'])} transactions")

                        # ── Block-level message ────────────────────────────
                        # Ethereum blocks land on a ~12 s cadence — a real,
                        # externally-given pulse. Emitting it lets SC use the
                        # block as a BAR (rhythmBlockBar) and seed that bar's
                        # pattern from the block hash (rhythmHashSeed) instead
                        # of running a metronome the chain merely decorates.
                        # Sent unconditionally; SC ignores it unless a scheme
                        # that wants it is enabled.
                        block_hash = block['hash'].hex() if hasattr(block['hash'], 'hex') else str(block['hash'])
                        base_fee = block.get('baseFeePerGas')
                        osc_client.send_message("/eth/block", [
                            int(block_num),
                            str(block_hash)[:18],
                            int(len(block['transactions'])),
                            float(w3.from_wei(base_fee, 'gwei')) if base_fee else 0.0,
                            float(block.get('timestamp', 0)),
                        ])

                        # Process each transaction in the block
                        for tx_index, tx in enumerate(block['transactions']):
                            # Convert to dict if it's an AttributeDict
                            tx_dict = dict(tx) if not isinstance(tx, dict) else tx
                            tx_hash = tx_dict['hash'].hex() if hasattr(tx_dict['hash'], 'hex') else tx_dict['hash']

                            # Skip if we've already processed this transaction
                            if tx_hash in processed_txs:
                                continue

                            processed_txs.add(tx_hash)
                            processed_order.append(tx_hash)
                            while len(processed_order) > MAX_PROCESSED:
                                processed_txs.discard(processed_order.popleft())

                            # Skip transactions with value less than threshold
                            if tx_dict['value'] < min_value_threshold:
                                continue

                            # Extract parameters
                            value = tx_dict['value']
                            # EIP-1559 txs use maxFeePerGas, not gasPrice — fall back through all options
                            gas_price = (tx_dict.get('gasPrice')
                                         or tx_dict.get('maxFeePerGas')
                                         or tx_dict.get('maxPriorityFeePerGas')
                                         or 20_000_000_000)  # 20 gwei fallback
                            to_address = tx_dict.get('to')

                            # Map to musical parameters
                            note = map_value_to_note(value)
                            velocity = map_gas_to_velocity(gas_price, base_fee)
                            instrument = get_instrument(tx_dict)

                            # Determine duration based on value (larger values = longer notes)
                            duration = min(2.0, 0.2 + float(w3.from_wei(value, 'ether')) / 100)

                            # Print info
                            print(f"TX: {tx_hash[:10]}... Value: {w3.from_wei(value, 'ether'):.5f} ETH → Note: {note}, Vel: {velocity}")

                            # Send tx_info FIRST so SC has the real values when /eth/note fires.
                            # Args 1–4 are unchanged (SC reads msg[1..4]); 5–10 are
                            # appended for the rhythm schemes, which is backward
                            # compatible — an older SC simply ignores the tail.
                            #   5 txIndex     position in the block = priority rank,
                            #                 since blocks are ordered by fee
                            #   6 priorityGwei / 7 baseGwei  the live gas signal
                            #   8 addrSig     stable voice identity per counterparty
                            #   9 nonce       how many times this sender has acted
                            #  10 calldataLen how complex the act was
                            calldata = tx_dict.get('input') or '0x'
                            calldata_len = max(0, (len(calldata) - 2) // 2) if isinstance(calldata, str) \
                                else len(calldata)
                            osc_client.send_message("/eth/tx_info", [
                                str(tx_hash)[:10],                          # Transaction hash (first 10 chars)
                                float(w3.from_wei(value, 'ether')),         # Value in ether
                                float(w3.from_wei(gas_price, 'gwei')),      # Gas price in gwei
                                str(to_address)[-8:] if to_address else "contract_creation",  # Last 8 chars of recipient
                                int(tx_index),
                                float(w3.from_wei(gas_price, 'gwei')),
                                float(w3.from_wei(base_fee, 'gwei')) if base_fee else 0.0,
                                int(address_signature(to_address)),
                                int(tx_dict.get('nonce') or 0),
                                int(calldata_len),
                            ])

                            # Then send the note trigger
                            osc_client.send_message("/eth/note", [note, velocity, instrument, duration])

                            # Add a small delay between transactions to spread out the sounds
                            await asyncio.sleep(0.05)

                    except Exception as e:
                        print(f"Error processing block {block_num}: {e}")

                # Update last processed block
                last_block_num = current_block_num

        except Exception as e:
            print(f"Error in main polling loop: {e}")

        # Wait before checking for new blocks again
        await asyncio.sleep(poll_interval)

# Main function
async def main():
    print("Connecting to Ethereum network...")

    if not w3.is_connected():
        print(f"Failed to connect to Ethereum node at {ETH_NODE_URL}")
        print("Please check your connection and Infura Project ID")
        return

    print(f"Connected to Ethereum! Latest block: {w3.eth.block_number}")
    print(f"Sending OSC messages to {OSC_IP}:{OSC_PORT}")

    # Start polling for new blocks
    await poll_transactions()

if __name__ == "__main__":
    # Fix for Python 3.13 asyncio warning
    asyncio.run(main())
