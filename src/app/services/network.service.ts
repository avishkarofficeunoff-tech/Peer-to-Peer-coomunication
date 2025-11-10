import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  private localIP: string | null = null;

  /**
   * Get local network IP address using WebRTC
   */
  async getLocalIPAddress(): Promise<string | null> {
    if (this.localIP) {
      return this.localIP;
    }

    return new Promise((resolve) => {
      const RTCPeerConnection = (window as any).RTCPeerConnection || 
                                (window as any).webkitRTCPeerConnection || 
                                (window as any).mozRTCPeerConnection;

      if (!RTCPeerConnection) {
        resolve(null);
        return;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.createDataChannel('');
      
      const candidates: string[] = [];
      
      pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          // Extract IP from candidate string - look for host candidate (type host)
          if (candidate && candidate.includes('typ host')) {
            const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
            if (ipMatch) {
              const ip = ipMatch[0];
              // Collect all candidate IPs
              if (ip && !candidates.includes(ip)) {
                candidates.push(ip);
                console.log('Found IP candidate:', ip);
                
                // Filter out localhost and invalid IPs, prioritize private network IPs
                if (ip !== '127.0.0.1' && 
                    !ip.startsWith('0.') && 
                    !ip.startsWith('169.254.')) {
                  
                  // Prioritize private network IPs (these are what we want for local network sharing)
                  const isPrivate = this.isPrivateIP(ip);
                  if (isPrivate) {
                    console.log('Found private IP:', ip);
                    this.localIP = ip;
                    pc.close();
                    resolve(ip);
                    return;
                  }
                }
              }
            }
          }
        } else {
          // No more candidates - check if we have any valid private IP
          console.log('All candidates collected:', candidates);
          if (!this.localIP && candidates.length > 0) {
            // Try to find a private IP from collected candidates (prioritize common ranges)
            const privateIPs = candidates.filter(ip => 
              ip !== '127.0.0.1' && 
              !ip.startsWith('0.') && 
              !ip.startsWith('169.254.') &&
              this.isPrivateIP(ip)
            );
            
            if (privateIPs.length > 0) {
              // Prioritize: 192.168 > 10 > 172
              privateIPs.sort((a, b) => {
                if (a.startsWith('192.168.')) return -1;
                if (b.startsWith('192.168.')) return 1;
                if (a.startsWith('10.')) return -1;
                if (b.startsWith('10.')) return 1;
                return 0;
              });
              
              const selectedIP = privateIPs[0];
              console.log('Selected private IP from candidates:', selectedIP);
              this.localIP = selectedIP;
              pc.close();
              resolve(selectedIP);
              return;
            }
          }
          // No valid IP found
          console.log('No valid private IP found');
          if (!this.localIP) {
            pc.close();
            resolve(null);
          }
        }
      };

      pc.createOffer()
        .then((offer: RTCSessionDescriptionInit) => pc.setLocalDescription(offer))
        .catch(() => {
          pc.close();
          resolve(null);
        });

      // Timeout after 5 seconds (increased for better detection)
      setTimeout(() => {
        if (!this.localIP && candidates.length > 0) {
          // Even after timeout, try to use any private IP we found
          const privateIPs = candidates.filter(ip => 
            ip !== '127.0.0.1' && 
            !ip.startsWith('0.') && 
            !ip.startsWith('169.254.') &&
            this.isPrivateIP(ip)
          );
          
          if (privateIPs.length > 0) {
            privateIPs.sort((a, b) => {
              if (a.startsWith('192.168.')) return -1;
              if (b.startsWith('192.168.')) return 1;
              if (a.startsWith('10.')) return -1;
              if (b.startsWith('10.')) return 1;
              return 0;
            });
            this.localIP = privateIPs[0];
            console.log('Timeout - using first private IP:', this.localIP);
            pc.close();
            resolve(this.localIP);
            return;
          }
        }
        if (!this.localIP) {
          console.log('Timeout - no IP found');
          pc.close();
          resolve(null);
        }
      }, 5000);
    });
  }

  /**
   * Get the current hostname/IP and port
   */
  getCurrentHost(): { host: string; port: string; protocol: string } {
    const hostname = window.location.hostname;
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const protocol = window.location.protocol;
    
    return { host: hostname, port, protocol };
  }

  /**
   * Generate network-accessible URL
   */
  async getNetworkUrl(path: string = ''): Promise<string> {
    const { protocol, port } = this.getCurrentHost();
    const protocolOnly = protocol.replace(':', '');
    
    // Try to get local IP
    const localIP = await this.getLocalIPAddress();
    
    if (localIP) {
      const portPart = (protocolOnly === 'https' && port === '443') || (protocolOnly === 'http' && port === '80') 
        ? '' 
        : `:${port}`;
      return `${protocolOnly}://${localIP}${portPart}${path}`;
    }
    
    // Fallback to current hostname (might be localhost)
    const hostname = window.location.hostname;
    const portPart = (protocolOnly === 'https' && port === '443') || (protocolOnly === 'http' && port === '80') 
      ? '' 
      : `:${port}`;
    
    return `${protocolOnly}://${hostname}${portPart}${path}`;
  }

  /**
   * Check if current host is localhost
   */
  isLocalhost(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '0.0.0.0';
  }

  /**
   * Check if IP is a private network IP
   */
  private isPrivateIP(ip: string): boolean {
    // Private IP ranges:
    // 10.0.0.0/8 (10.0.0.0 to 10.255.255.255)
    // 172.16.0.0/12 (172.16.0.0 to 172.31.255.255) - includes 172.23.x.x
    // 192.168.0.0/16 (192.168.0.0 to 192.168.255.255)
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;
    // Match 172.16.0.0/12 range (172.16.x.x to 172.31.x.x)
    const match = ip.match(/^172\.(\d{1,3})\./);
    if (match) {
      const secondOctet = parseInt(match[1], 10);
      return secondOctet >= 16 && secondOctet <= 31;
    }
    return false;
  }
}

