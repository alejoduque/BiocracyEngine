import os
import asyncio
import math
from web3 import Web3
from pythonosc import udp_client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration
INFURA_PROJECT_ID = os.environ.get("INFURA_PROJECT_ID")
if not INFURA_PROJECT_ID:
    print("WARNING: INFURA_PROJECT_ID not found in environment variables.")
    print("Please create a .env file based on .env.example")
    # For fallback, you might put a default or exit, but it's best to exit
    exit(1)

ETH_NODE_URL = f"https://mainnet.infura.io/v3/{INFURA_PROJECT_ID}"
OSC_IP = os.environ.get("OSC_IP", "127.0.0.1")
OSC_PORT = int(os.environ.get("OSC_PORT", 57120)) # SuperCollider default port

# Create Web3 connection with HTTP provider
w3 = Web3(Web3.HTTPProvider(ETH_NODE_URL))

# Create OSC client
osc_client = udp_client.SimpleUDPClient(OSC_IP, OSC_PORT)

# Map Ethereum value to a musical note (MIDI note)
def map_value_to_note(value, min_note=36, max_note=84):
    ether_value = w3.from_wei(value, 'ether')
    if ether_value == 0:
        return min_note

    # Log scale with some tuning to make it musical
    log_value = min(20, max(0, 10 * math.log10(float(ether_value) + 1) - 10))
    note = min_note + (log_value / 20) * (max_note - min_note)
    return int(note)

# Map gas price to velocity/volume
def map_gas_to_velocity(gas_price, min_vel=30, max_vel=120):
    gas_gwei = w3.from_wei(gas_price, 'gwei')
    normalized = min(1.0, max(0.0, (float(gas_gwei) - 10) / 300))
    velocity = min_vel + normalized * (max_vel - min_vel)
    return int(velocity)

# Generate instrument based on transaction type
def get_instrument(tx_data):
    if tx_data.get('input') and tx_data['input'] != '0x':
        return 2  # Contract interaction
    else:
        return 1  # Basic transaction

# Poll for new blocks and transactions
async def poll_transactions(poll_interval=3):
    print(f"Starting to poll for new blocks every {poll_interval} seconds...")
    last_block_num = w3.eth.block_number
    print(f"Current block: {last_block_num}")

    processed_txs = set()
    min_value_threshold = w3.to_wei(0.0001, 'ether')
    print(f"Minimum transaction value threshold: {w3.from_wei(min_value_threshold, 'ether')} ETH")

    while True:
        try:
            current_block_num = w3.eth.block_number

            if current_block_num > last_block_num:
                print(f"New block(s) detected! Processing from {last_block_num+1} to {current_block_num}")

                for block_num in range(last_block_num + 1, current_block_num + 1):
                    try:
                        block = w3.eth.get_block(block_num, full_transactions=True)
                        print(f"Block {block_num} has {len(block['transactions'])} transactions")

                        for tx in block['transactions']:
                            tx_dict = dict(tx) if not isinstance(tx, dict) else tx
                            tx_hash = tx_dict['hash'].hex() if hasattr(tx_dict['hash'], 'hex') else tx_dict['hash']

                            if tx_hash in processed_txs:
                                continue

                            processed_txs.add(tx_hash)

                            if tx_dict['value'] < min_value_threshold:
                                continue

                            value = tx_dict['value']
                            gas_price = tx_dict.get('gasPrice', 0)
                            to_address = tx_dict.get('to')

                            note = map_value_to_note(value)
                            velocity = map_gas_to_velocity(gas_price)
                            instrument = get_instrument(tx_dict)
                            duration = min(2.0, 0.2 + float(w3.from_wei(value, 'ether')) / 100)

                            print(f"TX: {tx_hash[:10]}... Value: {w3.from_wei(value, 'ether'):.5f} ETH → Note: {note}, Vel: {velocity}")

                            # Send OSC messages
                            osc_client.send_message("/eth/note", [note, velocity, instrument, duration])
                            osc_client.send_message("/eth/tx_info", [
                                str(tx_hash)[:10],
                                float(w3.from_wei(value, 'ether')),
                                float(w3.from_wei(gas_price, 'gwei')),
                                str(to_address)[-8:] if to_address else "contract_creation"
                            ])

                            # Adding delay for pacing
                            await asyncio.sleep(0.05)

                    except Exception as e:
                        print(f"Error processing block {block_num}: {e}")

                last_block_num = current_block_num

                if len(processed_txs) > 1000:
                    processed_txs = set(list(processed_txs)[-500:])

        except Exception as e:
            print(f"Error in main polling loop: {e}")

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

    await poll_transactions()

if __name__ == "__main__":
    asyncio.run(main())
