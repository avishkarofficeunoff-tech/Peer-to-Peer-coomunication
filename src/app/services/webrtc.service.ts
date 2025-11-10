import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import Peer, { DataConnection } from 'peerjs';

export interface FileTransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  fileName: string;
  status: 'connecting' | 'transferring' | 'completed' | 'error';
  error?: string;
  file?: File; // Optional file object for completed transfers
}

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private peer: Peer | null = null;
  private dataConnection: DataConnection | null = null;
  private progressSubject = new BehaviorSubject<FileTransferProgress | null>(null);
  public progress$: Observable<FileTransferProgress | null> = this.progressSubject.asObservable();
  private isConnected = false;

  private readonly CHUNK_SIZE = 16 * 1024; // 16KB chunks
  private readonly MAX_CHUNK_SIZE = 64 * 1024; // Max 64KB for data channels

  /**
   * Initialize as sender (host) and prepare file for sharing
   */
  async initializeAsSender(roomId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(roomId, {
          host: '0.peerjs.com',
          port: 443,
          path: '/',
          secure: true,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('Peer connected as sender with ID:', id);
          resolve(id);
        });

        this.peer.on('error', (error: Error) => {
          console.error('Peer error:', error);
          reject(error);
        });

        this.peer.on('connection', (conn) => {
          console.log('Receiver connected');
          this.dataConnection = conn;
          this.setupDataConnection();
          this.isConnected = true;
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Initialize as receiver and connect to sender
   */
  async initializeAsReceiver(senderId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Generate random receiver ID
        const receiverId = 'receiver-' + Math.random().toString(36).substring(2, 9);
        
        this.peer = new Peer(receiverId, {
          host: '0.peerjs.com',
          port: 443,
          path: '/',
          secure: true,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', () => {
          console.log('Peer connected as receiver');
          
          // Connect to sender
          this.dataConnection = this.peer!.connect(senderId, {
            reliable: true
          });

          this.dataConnection.on('open', () => {
            console.log('Connected to sender');
            this.setupDataConnection();
            this.isConnected = true;
            resolve();
          });

          this.dataConnection.on('error', (error: Error) => {
            console.error('Connection error:', error);
            this.progressSubject.next({
              bytesTransferred: 0,
              totalBytes: 0,
              percentage: 0,
              fileName: '',
              status: 'error',
              error: error.message
            });
            reject(error);
          });
        });

        this.peer.on('error', (error: Error) => {
          console.error('Peer error:', error);
          this.progressSubject.next({
            bytesTransferred: 0,
            totalBytes: 0,
            percentage: 0,
            fileName: '',
            status: 'error',
            error: error.message
          });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Setup data connection event handlers
   */
  private setupDataConnection(): void {
    if (!this.dataConnection) return;

    this.dataConnection.on('data', (data: any) => {
      this.handleIncomingData(data);
    });

    this.dataConnection.on('close', () => {
      console.log('Data connection closed');
    });

    this.dataConnection.on('error', (error: Error) => {
      console.error('Data connection error:', error);
      this.progressSubject.next({
        bytesTransferred: 0,
        totalBytes: 0,
        percentage: 0,
        fileName: '',
        status: 'error',
        error: error.message
      });
    });
  }

  /**
   * Send file to receiver
   */
  async sendFile(file: File): Promise<void> {
    if (!this.isConnected || !this.dataConnection || this.dataConnection.open === false) {
      throw new Error('Data connection not established. Please wait for receiver to connect.');
    }

    const fileBuffer = await file.arrayBuffer();
    const totalBytes = fileBuffer.byteLength;
    let bytesSent = 0;

    // Send file metadata first
    this.dataConnection.send({
      type: 'file-metadata',
      fileName: file.name,
      fileSize: totalBytes,
      fileType: file.type
    });

    // Send file in chunks
    const chunks = Math.ceil(totalBytes / this.CHUNK_SIZE);
    
    this.progressSubject.next({
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      fileName: file.name,
      status: 'transferring'
    });

    for (let i = 0; i < chunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, totalBytes);
      const chunk = fileBuffer.slice(start, end);

      // Wait a bit to avoid overwhelming the connection
      await new Promise(resolve => setTimeout(resolve, 10));

      // Send chunk with ArrayBuffer to avoid huge JSON arrays that blow the stack
      this.dataConnection.send({
        type: 'file-chunk',
        chunkIndex: i,
        // Send as ArrayBuffer; PeerJS supports ArrayBuffer/Blob natively
        data: chunk,
        isLast: i === chunks - 1
      });

      bytesSent = end;
      const percentage = Math.round((bytesSent / totalBytes) * 100);

      this.progressSubject.next({
        bytesTransferred: bytesSent,
        totalBytes,
        percentage,
        fileName: file.name,
        status: 'transferring'
      });
    }

    // Send completion message
    this.dataConnection.send({
      type: 'file-complete'
    });

    // Update progress to completed
    this.progressSubject.next({
      bytesTransferred: totalBytes,
      totalBytes,
      percentage: 100,
      fileName: file.name,
      status: 'completed'
    });
  }

  /**
   * Handle incoming data (receiver side)
   */
  private receivedChunks: Uint8Array[] = [];
  private fileMetadata: { fileName: string; fileSize: number; fileType: string } | null = null;

  private handleIncomingData(data: any): void {
    if (data.type === 'file-metadata') {
      console.log('📄 Received file metadata:', data.fileName, data.fileSize, 'bytes');
      this.fileMetadata = {
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType
      };
      this.receivedChunks = [];
      // Initialize array with proper size
      const totalChunks = Math.ceil(data.fileSize / this.CHUNK_SIZE);
      this.receivedChunks = new Array(totalChunks);
      
      this.progressSubject.next({
        bytesTransferred: 0,
        totalBytes: data.fileSize,
        percentage: 0,
        fileName: data.fileName,
        status: 'transferring'
      });
    } else if (data.type === 'file-chunk') {
      if (this.fileMetadata) {
        // Store chunk at the correct index
        try {
          // Handle both ArrayBuffer and plain array gracefully
          const chunkData = data.data instanceof ArrayBuffer
            ? new Uint8Array(data.data as ArrayBuffer)
            : new Uint8Array(data.data);
          this.receivedChunks[data.chunkIndex] = chunkData;
          
          // Calculate bytes received (count only defined chunks)
          const bytesReceived = this.receivedChunks
            .filter(chunk => chunk !== undefined && chunk !== null)
            .reduce((acc, chunk) => acc + chunk.length, 0);
          
          const percentage = Math.round((bytesReceived / this.fileMetadata.fileSize) * 100);

          // Log progress periodically
          if (percentage % 25 === 0 || data.isLast || percentage === 100) {
            console.log(`📥 Download progress: ${percentage}% (${bytesReceived}/${this.fileMetadata.fileSize} bytes)`);
          }

          this.progressSubject.next({
            bytesTransferred: bytesReceived,
            totalBytes: this.fileMetadata.fileSize,
            percentage,
            fileName: this.fileMetadata.fileName,
            status: 'transferring'
          });
        } catch (error) {
          console.error('Error processing chunk:', error);
        }
      } else {
        console.error('❌ Received file chunk but no metadata available');
      }
    } else if (data.type === 'file-complete') {
      if (this.fileMetadata) {
        console.log('File transfer complete, reconstructing file...');
        console.log('File metadata:', this.fileMetadata);
        console.log('Total chunks received:', this.receivedChunks.length);
        
        // Count valid chunks
        const validChunks = this.receivedChunks.filter(chunk => chunk !== undefined && chunk !== null);
        console.log('Valid chunks:', validChunks.length);
        
        // Reconstruct file
        const fileArray = new Uint8Array(this.fileMetadata.fileSize);
        let offset = 0;
        let totalReceived = 0;
        
        // Process chunks in order
        for (let i = 0; i < this.receivedChunks.length; i++) {
          const chunk = this.receivedChunks[i];
          if (chunk && chunk.length > 0) {
            fileArray.set(chunk, offset);
            offset += chunk.length;
            totalReceived += chunk.length;
          }
        }
        
        console.log('File reconstruction complete.');
        console.log('Expected size:', this.fileMetadata.fileSize, 'bytes');
        console.log('Actual size:', totalReceived, 'bytes');
        console.log('File name:', this.fileMetadata.fileName);
        console.log('File type:', this.fileMetadata.fileType);
        
        if (totalReceived !== this.fileMetadata.fileSize) {
          console.warn('⚠️ File size mismatch! Expected:', this.fileMetadata.fileSize, 'Got:', totalReceived);
          console.warn('Missing bytes:', this.fileMetadata.fileSize - totalReceived);
        }

        const blob = new Blob([fileArray], { type: this.fileMetadata.fileType });
        const file = new File([blob], this.fileMetadata.fileName, { type: this.fileMetadata.fileType });
        
        console.log('✅ File object created:', file.name, file.size, 'bytes', 'type:', file.type);
        console.log('File blob size:', blob.size, 'bytes');

        // Update progress with completed status and file
        this.progressSubject.next({
          bytesTransferred: this.fileMetadata.fileSize,
          totalBytes: this.fileMetadata.fileSize,
          percentage: 100,
          fileName: this.fileMetadata.fileName,
          status: 'completed',
          file: file
        });

        console.log('✅ Progress updated with completed status and file object');

        // Reset for next transfer
        this.receivedChunks = [];
        this.fileMetadata = null;
      } else {
        console.error('❌ File complete received but no metadata available');
      }
    }
  }

  /**
   * Get the downloaded file (receiver side)
   */
  getDownloadedFile(): File | null {
    const progress = this.progressSubject.value;
    if (progress && progress.status === 'completed' && progress.file) {
      return progress.file;
    }
    return null;
  }

  /**
   * Download file (trigger browser download)
   */
  downloadFile(file: File): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.error('Window or document not available');
      return;
    }

    try {
      console.log('🔄 Creating download for file:', file.name, file.size, 'bytes', 'type:', file.type);
      
      // Create blob URL
      const url = URL.createObjectURL(file);
      console.log('📎 Blob URL created:', url);
      
      // Create download link element
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      a.setAttribute('download', file.name); // Ensure download attribute is set
      
      // Append to body (required for some browsers)
      document.body.appendChild(a);
      console.log('📎 Download link added to DOM');
      
      // Create and dispatch click event
      // Trigger a single programmatic click
      if (typeof (a as any).click === 'function') {
        (a as any).click();
        console.log('✅ Programmatic click executed');
      } else {
        // Fallback to dispatching an event if .click is not available
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          buttons: 1
        });
        a.dispatchEvent(clickEvent);
        console.log('✅ Download click event dispatched (fallback)');
      }
      
      // Force download by opening in new window as fallback (for some browsers)
      setTimeout(() => {
        try {
          // Cleanup
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
          // Revoke URL after a delay to ensure download started
          setTimeout(() => {
            URL.revokeObjectURL(url);
            console.log('🧹 Blob URL revoked');
          }, 1000);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }, 100);
    } catch (error) {
      console.error('❌ Error in downloadFile:', error);
      throw error;
    }
  }

  /**
   * Cleanup connections
   */
  cleanup(): void {
    if (this.dataConnection) {
      this.dataConnection.close();
      this.dataConnection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.receivedChunks = [];
    this.fileMetadata = null;
    this.isConnected = false;
    this.progressSubject.next(null);
  }

  /**
   * Check if connection is established (sender side)
   */
  isConnectionReady(): boolean {
    return this.isConnected && this.dataConnection !== null && this.dataConnection.open === true;
  }

  /**
   * Generate unique room ID
   */
  generateRoomId(): string {
    return 'room-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

