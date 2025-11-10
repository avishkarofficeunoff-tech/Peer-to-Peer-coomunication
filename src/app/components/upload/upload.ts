import { Component, OnInit, OnDestroy, signal, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WebRTCService } from '../../services/webrtc.service';
import { NetworkService } from '../../services/network.service';

@Component({
  selector: 'app-upload',
  imports: [CommonModule, FormsModule],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class Upload implements OnInit, OnDestroy {
  selectedFile: File | null = null;
  roomId = signal<string>('');
  shareableLink = signal<string>('');
  isUploading = signal<boolean>(false);
  uploadProgress = signal<number>(0);
  error = signal<string>('');
  isReady = signal<boolean>(false);
  isWaitingForReceiver = signal<boolean>(false);
  isDetectingIP = signal<boolean>(true);
  localIP = signal<string | null>(null);
  manualIP = signal<string>('');
  showManualIP = signal<boolean>(false);
  private connectionCheckInterval: any;

  constructor(
    private webRTCService: WebRTCService,
    public networkService: NetworkService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  async ngOnInit(): Promise<void> {
    // Only initialize in browser environment
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Detect local IP address in background (but don't generate link yet)
    this.detectLocalIP();
    
    // Subscribe to progress updates
    this.webRTCService.progress$.subscribe(progress => {
      if (progress) {
        this.uploadProgress.set(progress.percentage);
        if (progress.status === 'completed') {
          this.isUploading.set(false);
        } else if (progress.status === 'error') {
          this.error.set(progress.error || 'Upload failed');
          this.isUploading.set(false);
        }
      }
    });

    // Check connection status periodically
    this.connectionCheckInterval = setInterval(() => {
      if (this.selectedFile && !this.isUploading()) {
        this.isReady.set(this.webRTCService.isConnectionReady());
        this.isWaitingForReceiver.set(!this.isReady() && this.selectedFile !== null);
      }
    }, 500);
  }

  async detectLocalIP(): Promise<void> {
    this.isDetectingIP.set(true);
    try {
      console.log('Starting IP detection...');
      const ip = await this.networkService.getLocalIPAddress();
      console.log('IP detection result:', ip);
      this.localIP.set(ip);
      if (!ip && this.networkService.isLocalhost()) {
        console.log('No IP detected, showing manual input');
        this.showManualIP.set(true);
        // Set a default IP suggestion based on common network ranges
        // User's system IP is 172.23.10.125, so we'll suggest the format
        this.manualIP.set('172.23.10.125'); // Pre-fill with detected system IP if available
      } else if (ip) {
        console.log('IP detected successfully:', ip);
        this.showManualIP.set(false);
      }
    } catch (error) {
      console.error('Error detecting IP:', error);
      if (this.networkService.isLocalhost()) {
        this.showManualIP.set(true);
        this.manualIP.set('172.23.10.125'); // Pre-fill with known system IP
      }
    } finally {
      this.isDetectingIP.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    this.webRTCService.cleanup();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.error.set('');
      
      // Generate room ID and link when file is selected
      const room = this.webRTCService.generateRoomId();
      this.roomId.set(room);
      
      // Wait for IP detection to complete (or timeout)
      if (!this.localIP() && this.isDetectingIP()) {
        // Wait a bit more for IP detection
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // If still no IP detected and we're on localhost, pre-fill with known system IP
      if (!this.localIP() && !this.manualIP() && this.networkService.isLocalhost()) {
        console.log('No IP detected, pre-filling with system IP: 172.23.10.125');
        this.manualIP.set('172.23.10.125');
        this.showManualIP.set(true);
      }
      
      // Generate shareable link
      await this.generateShareableLink(room);
      
      // Initialize WebRTC connection as sender
      await this.initializeSender();
    }
  }

  async initializeSender(): Promise<void> {
    if (!this.selectedFile) return;

    try {
      this.isReady.set(false);
      this.isWaitingForReceiver.set(true);
      this.error.set('');
      
      await this.webRTCService.initializeAsSender(this.roomId());
      // Connection will be ready when receiver connects
    } catch (error: any) {
      this.error.set(error.message || 'Failed to initialize connection');
      this.isWaitingForReceiver.set(false);
      console.error('Error initializing sender:', error);
    }
  }

  async shareFile(): Promise<void> {
    if (!this.selectedFile || !this.isReady()) {
      this.error.set('Please select a file and wait for connection to be ready');
      return;
    }

    try {
      this.isUploading.set(true);
      this.error.set('');
      await this.webRTCService.sendFile(this.selectedFile);
    } catch (error: any) {
      this.error.set(error.message || 'Failed to share file');
      this.isUploading.set(false);
      console.error('Error sharing file:', error);
    }
  }

  async generateShareableLink(roomId: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    
    try {
      const { protocol } = this.networkService.getCurrentHost();
      const protocolOnly = protocol.replace(':', '');
      
      // Get the actual port from the current URL (should be 4200 for dev server)
      const currentPort = window.location.port || '4200';
      
      // Priority: manual IP > detected IP > fallback to known system IP
      let ip = this.manualIP().trim() || this.localIP();
      
      // If we're on localhost and don't have an IP yet, try to detect it one more time
      if (this.networkService.isLocalhost() && !ip) {
        console.log('Attempting final IP detection...');
        const detectedIP = await this.networkService.getLocalIPAddress();
        if (detectedIP) {
          ip = detectedIP;
          this.localIP.set(detectedIP);
          console.log('✅ IP detected via WebRTC:', detectedIP);
        }
      }
      
      // Fallback to known system IP if still no IP found
      if (!ip || !ip.trim()) {
        console.log('⚠️ No IP detected, using fallback: 172.23.10.125');
        ip = '172.23.10.125';
        // Pre-fill manual IP field if empty
        if (!this.manualIP().trim()) {
          this.manualIP.set(ip);
          this.showManualIP.set(true);
        }
      }
      
      // Always generate link with IP and port
      const link = `http://${ip.trim()}:${currentPort}/download/${roomId}`;
      this.shareableLink.set(link);
      console.log('✅ Generated shareable link:', link);
      console.log('📍 IP:', ip.trim(), 'Port:', currentPort);
      console.log('🔗 Test URL: http://' + ip.trim() + ':' + currentPort);
    } catch (error) {
      console.error('Error generating link:', error);
      // Fallback with known IP
      const currentPort = window.location.port || '4200';
      const link = `http://172.23.10.125:${currentPort}/download/${roomId}`;
      this.shareableLink.set(link);
      console.log('Fallback link generated:', link);
    }
  }

  async onManualIPChange(): Promise<void> {
    const ip = this.manualIP().trim();
    if (ip) {
      // Validate IP format
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipRegex.test(ip)) {
        await this.generateShareableLink(this.roomId());
      } else {
        this.error.set('Please enter a valid IP address (e.g., 192.168.1.100)');
      }
    }
  }

  copyToClipboard(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const textToCopy = this.shareableLink();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        console.log('Link copied to clipboard:', textToCopy);
        // You could add a toast notification here
      }).catch(err => {
        console.error('Failed to copy:', err);
        this.error.set('Failed to copy link');
      });
    } else {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        console.log('Link copied to clipboard (fallback):', textToCopy);
      } catch (err) {
        console.error('Failed to copy:', err);
        this.error.set('Failed to copy link');
      }
      document.body.removeChild(textArea);
    }
  }

  copyTestUrl(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const ip = this.localIP() || this.manualIP() || '172.23.10.125';
    const port = window.location.port || '4200';
    const testUrl = `http://${ip}:${port}`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(testUrl).then(() => {
        console.log('Test URL copied:', testUrl);
      }).catch(err => {
        console.error('Failed to copy test URL:', err);
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = testUrl;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        console.log('Test URL copied (fallback):', testUrl);
      } catch (err) {
        console.error('Failed to copy test URL:', err);
      }
      document.body.removeChild(textArea);
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}
