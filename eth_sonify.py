import asyncio
import time
import math
from datetime import datetime
from web3 import Web3
from pythonosc import udp_client

# Configuration
# Using HTTP provider since we can't use the pending filter with Infura
ETH_NODE_URL = "https://mainnet.infura.io/v3/76a669b9a1fe48f7b8a7e145d76bf95d"
OSC_IP = "127.0.0.1"  # localhost - change if your audio software is on another machine
OSC_PORT = 57120      # SuperCollider default port (change according to your software)

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

# Map gas price to velocity/volume
def map_gas_to_velocity(gas_price, min_vel=30, max_vel=120):
    gas_gwei = w3.from_wei(gas_price, 'gwei')
    # Normalize and map to MIDI velocity range
    normalized = min(1.0, max(0.0, (float(gas_gwei) - 10) / 300))
    velocity = min_vel + normalized * (max_vel - min_vel)
    return int(velocity)

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

    # Track processed transaction hashes to avoid duplicates
    processed_txs = set()

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

                        # Process each transaction in the block
                        for tx in block['transactions']:
                            # Convert to dict if it's an AttributeDict
                            tx_dict = dict(tx) if not isinstance(tx, dict) else tx
                            tx_hash = tx_dict['hash'].hex() if hasattr(tx_dict['hash'], 'hex') else tx_dict['hash']

                            # Skip if we've already processed this transaction
                            if tx_hash in processed_txs:
                                continue

                            processed_txs.add(tx_hash)

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
                            velocity = map_gas_to_velocity(gas_price)
                            instrument = get_instrument(tx_dict)

                            # Determine duration based on value (larger values = longer notes)
                            duration = min(2.0, 0.2 + float(w3.from_wei(value, 'ether')) / 100)

                            # Print info
                            print(f"TX: {tx_hash[:10]}... Value: {w3.from_wei(value, 'ether'):.5f} ETH → Note: {note}, Vel: {velocity}")

                            # Send tx_info FIRST so SC has the real values when /eth/note fires
                            osc_client.send_message("/eth/tx_info", [
                                str(tx_hash)[:10],                          # Transaction hash (first 10 chars)
                                float(w3.from_wei(value, 'ether')),         # Value in ether
                                float(w3.from_wei(gas_price, 'gwei')),      # Gas price in gwei
                                str(to_address)[-8:] if to_address else "contract_creation"  # Last 8 chars of recipient
                            ])

                            # Then send the note trigger
                            osc_client.send_message("/eth/note", [note, velocity, instrument, duration])

                            # Add a small delay between transactions to spread out the sounds
                            await asyncio.sleep(0.05)

                    except Exception as e:
                        print(f"Error processing block {block_num}: {e}")

                # Update last processed block
                last_block_num = current_block_num

                # Keep the processed_txs set from growing too large
                if len(processed_txs) > 1000:
                    processed_txs = set(list(processed_txs)[-500:])

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
