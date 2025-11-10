import { Component, OnInit, OnDestroy, signal, effect, PLATFORM_ID, Inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { WebRTCService, FileTransferProgress } from '../../services/webrtc.service';

@Component({
  selector: 'app-download',
  imports: [CommonModule],
  templateUrl: './download.html',
  styleUrls: ['./download.scss'],
})
export class Download implements OnInit, OnDestroy, AfterViewInit {
  roomId = signal<string>('');
  progress = signal<FileTransferProgress | null>(null);
  error = signal<string>('');
  isConnecting = signal<boolean>(true);
  downloadedFile: File | null = null;

  autoDownloadAttempted = signal<boolean>(false);
  downloadTriggered = signal<boolean>(false);
  downloadStarted = signal<boolean>(false);
  @ViewChild('downloadBtn') downloadButtonRef?: ElementRef<HTMLButtonElement>;

  private routeSub?: any;
  private progressSub?: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private webRTCService: WebRTCService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Only initialize in browser environment
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Get room ID from route
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.roomId.set(id);
        this.connectToSender(id);
      } else {
        this.error.set('Invalid room ID');
        this.isConnecting.set(false);
      }
    });

    // Subscribe to progress updates
    this.progressSub = this.webRTCService.progress$.subscribe(progress => {
      if (progress) {
        this.progress.set(progress);
        this.isConnecting.set(false);
        
        if (progress.status === 'error') {
          this.error.set(progress.error || 'Download failed');
        } else if (progress.status === 'transferring') {
          this.error.set('');
        } else if (progress.status === 'completed' && progress.file) {
          console.log('✅ Progress update: File completed');
          console.log('File name:', progress.file.name);
          console.log('File size:', progress.file.size, 'bytes');
          console.log('File type:', progress.file.type);
          console.log('File object valid:', progress.file instanceof File);
          this.downloadedFile = progress.file;
          
          // Trigger download immediately when we get the completed status
          if (!this.downloadTriggered()) {
            console.log('🚀 Triggering auto-download...');
            this.downloadTriggered.set(true);
            
            // Attempt auto download once
            setTimeout(() => {
              this.attemptAutoDownload();
            }, 100);
            // As a fallback, try clicking the download button once
            setTimeout(() => {
              this.autoClickDownloadButton();
            }, 600);
          }
        }
      }
    });
  }

  attemptAutoDownload(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.downloadStarted()) {
      return;
    }
    if (this.downloadTriggered() && this.autoDownloadAttempted()) {
      return;
    }

    const file = this.downloadedFile || this.progress()?.file;
    if (!file) {
      console.error('❌ No file available for download');
      console.log('Downloaded file:', this.downloadedFile);
      console.log('Progress file:', this.progress()?.file);
      return;
    }

    console.log('🔄 Attempting auto-download:', file.name, file.size, 'bytes');
    this.autoDownloadAttempted.set(true);

    try {
      if (this.downloadStarted()) return;
      this.downloadStarted.set(true);
      // Trigger download using service method (single approach to avoid duplicates)
      this.webRTCService.downloadFile(file);
    } catch (error) {
      console.error('❌ Auto-download failed:', error);
      this.downloadStarted.set(false);
      // Fallback: Download button will be visible for manual click
    }
  }

  triggerDownload(file: File): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      if (this.downloadStarted()) return;
      this.downloadStarted.set(true);
      // Use centralized service method
      this.webRTCService.downloadFile(file);
    } catch (error) {
      console.error('Download trigger error:', error);
      this.downloadStarted.set(false);
      // If auto-download fails, the download button will be visible for manual click
    }
  }

  ngAfterViewInit(): void {
    // After view is initialized, check if we need to trigger download
    if (this.progress()?.status === 'completed' && this.progress()?.file && !this.downloadTriggered()) {
      setTimeout(() => {
        this.attemptAutoDownload();
      }, 500);
    }
  }

  autoClickDownloadButton(): void {
    if (this.downloadStarted()) {
      return;
    }
    if (this.downloadButtonRef && this.downloadButtonRef.nativeElement) {
      console.log('🖱️ Attempting to programmatically click download button...');
      try {
        // Create and dispatch click event
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        this.downloadButtonRef.nativeElement.dispatchEvent(clickEvent);
        console.log('✅ Download button click event dispatched');
      } catch (error) {
        console.error('Failed to click download button:', error);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe?.();
      this.routeSub = undefined;
    }
    if (this.progressSub) {
      this.progressSub.unsubscribe?.();
      this.progressSub = undefined;
    }
    this.webRTCService.cleanup();
  }

  async connectToSender(senderId: string): Promise<void> {
    try {
      this.isConnecting.set(true);
      this.error.set('');
      await this.webRTCService.initializeAsReceiver(senderId);
      this.progress.set({
        bytesTransferred: 0,
        totalBytes: 0,
        percentage: 0,
        fileName: '',
        status: 'connecting'
      });
    } catch (error: any) {
      this.error.set(error.message || 'Failed to connect to sender');
      this.isConnecting.set(false);
      console.error('Error connecting to sender:', error);
    }
  }

  downloadFile(): void {
    console.log('Manual download triggered');
    if (this.downloadStarted()) {
      console.log('Download already started, ignoring manual click');
      return;
    }
    const file = this.downloadedFile || this.progress()?.file;
    if (file) {
      console.log('Downloading file:', file.name, file.size);
      this.triggerDownload(file);
    } else {
      console.error('No file available to download');
      this.error.set('No file available to download. Please refresh and try again.');
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatSpeed(bytesPerSecond: number): string {
    return this.formatFileSize(bytesPerSecond) + '/s';
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
