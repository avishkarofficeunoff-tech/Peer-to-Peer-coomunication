# WebRTC Peer-to-Peer File Sharing

A fully frontend-only Angular application that enables peer-to-peer file sharing using WebRTC. Upload a file, generate a shareable link, and transfer files directly between browsers on the same network without any backend server.

## Features

- ✅ **Fully Frontend Only** - No backend server required
- ✅ **WebRTC Peer-to-Peer** - Direct browser-to-browser file transfer
- ✅ **Real-time Progress Bar** - Visual progress indicator during file transfer
- ✅ **PDF & Other Files** - Supports PDF, DOC, DOCX, TXT, JPG, PNG and more
- ✅ **Modern UI** - Beautiful, responsive design
- ✅ **Angular 20+** - Built with latest Angular framework

## How It Works

1. **Upload File**: Select a file on the sender's device
2. **Generate Link**: A unique shareable link is automatically generated
3. **Share Link**: Copy and share the link with the receiver
4. **Connect**: Receiver opens the link and establishes a WebRTC connection
5. **Transfer**: File is transferred peer-to-peer with real-time progress
6. **Download**: File automatically downloads when transfer completes

## Technology Stack

- **Angular 20.3.0** - Frontend framework
- **PeerJS** - WebRTC abstraction library
- **WebRTC Data Channels** - For peer-to-peer file transfer
- **RxJS** - Reactive programming for state management

## Installation

```bash
# Install dependencies
npm install

# Start development server (accessible from network)
npm start

# Build for production
npm run build
```

**Important**: The dev server is configured to run with `--host 0.0.0.0` which makes it accessible from other devices on your local network. The application will automatically detect your local IP address and generate a network-accessible link.

## Usage

### As Sender (File Uploader)

1. Open the application in your browser
2. Click to select a file or drag and drop
3. Wait for the connection to be ready (you'll see "Waiting for receiver to connect...")
4. Copy the shareable link that appears
5. Share the link with the receiver
6. Once the receiver connects, click "Share File" button
7. Monitor the upload progress

### As Receiver (File Downloader)

1. Open the shareable link in your browser (on the same network)
2. The page will automatically connect to the sender
3. Wait for the file transfer to begin
4. Monitor the download progress in real-time
5. The file will automatically download when transfer completes

## Network Requirements

- Both devices must be on the same local network
- WebRTC uses STUN servers for NAT traversal
- No special firewall configuration needed (uses standard WebRTC ports)

## File Transfer Process

1. **Connection Establishment**: Uses PeerJS signaling server (free public server)
2. **File Chunking**: Files are split into 16KB chunks for transfer
3. **Progress Tracking**: Real-time progress updates via WebRTC data channels
4. **File Reconstruction**: Chunks are reassembled on the receiver side
5. **Auto Download**: File automatically downloads when transfer completes

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (may have limitations)
- Opera

## Limitations

- Files are stored in browser memory (not persisted on server)
- Requires both devices to be online simultaneously
- File size limitations depend on browser memory
- Works best on the same local network

## Development

```bash
# Run development server
ng serve

# Build for production
ng build

# Run tests
ng test
```

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── upload/          # File upload component
│   │   └── download/        # File download component
│   ├── services/
│   │   └── webrtc.service.ts # WebRTC peer connection service
│   ├── app.routes.ts        # Application routes
│   └── app.ts               # Root component
└── styles.scss              # Global styles
```

## Troubleshooting

### Connection Issues

- **Link not accessible from other devices**: 
  - Make sure you're running the dev server with `npm start` (which includes `--host 0.0.0.0`)
  - The app will automatically detect your local IP address
  - If IP detection fails, you can manually enter your computer's IP address
  - Find your IP: Windows (`ipconfig`) | Mac/Linux (`ifconfig`)
- Ensure both devices are on the same network
- Check browser console for errors
- Try refreshing both pages
- Verify firewall settings allow WebRTC and the dev server port (default: 4200)

### File Transfer Issues

- Check file size (very large files may cause memory issues)
- Ensure stable network connection
- Try with smaller files first

## License

This project is open source and available for use.

## Credits

- Built with Angular 20+
- WebRTC powered by PeerJS
- STUN servers provided by Google
