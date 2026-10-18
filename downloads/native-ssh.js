'use strict';
// Copyright (c) 2026 Frank Parussel
// Newly written component for the local alexa-fhem SHA-2 adaptation.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {Client, utils} = require('ssh2');
const net = require('net');
const {EventEmitter} = require('events');
const {PassThrough} = require('stream');

// RFC 8332 keeps the public key blob as ssh-rsa, but uses a SHA-2 algorithm
// in the authentication request and signature. Use ssh2's parsed-key API;
// never mutate the original key or patch the dependency's internal protocol.
function publicKeyForSHA2(key, algorithm = 'rsa-sha2-512') {
  const hash = {'rsa-sha2-512':'sha512', 'rsa-sha2-256':'sha256'}[algorithm];
  if (!hash || !key || key.type !== 'ssh-rsa') throw new Error('RSA/SHA-2 key required');
  const modern = Object.create(key);
  Object.defineProperties(modern, {
    type: {value:algorithm},
    sign: {value(data, requestedHash) {
      if (requestedHash && requestedHash !== hash) throw new Error('SHA-2 downgrade rejected');
      return key.sign(data, hash);
    }}
  });
  return modern;
}

function hostPattern(pattern, name) {
  if (pattern.startsWith('|1|')) {
    const parts = pattern.split('|');
    if (parts.length !== 4) return false;
    // HMAC-SHA1 is the existing OpenSSH hostname obfuscation format,
    // not a network signature or a SHA-1 authentication fallback.
    return crypto.createHmac('sha1', Buffer.from(parts[2], 'base64'))
      .update(name).digest('base64') === parts[3];
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g,'.*').replace(/\?/g,'.');
  return new RegExp('^'+escaped+'$', 'i').test(name);
}

function hostVerifier(contents, hostname, port) {
  const name = port === 22 ? hostname : '['+hostname+']:'+port;
  const allowed = [], revoked = [];
  for (const line of contents.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (!fields[0] || fields[0].startsWith('#')) continue;
    const marker = fields[0].startsWith('@') ? fields.shift() : '';
    if (marker && marker !== '@revoked') continue;
    const patterns = fields[0].split(',');
    if (patterns.some(p => p[0]==='!' && hostPattern(p.slice(1),name))) continue;
    if (!patterns.some(p => p[0]!=='!' && hostPattern(p,name))) continue;
    if (fields.length < 3 || !/^[A-Za-z0-9+/]+={0,2}$/.test(fields[2]))
      throw new Error('Malformed matching known_hosts entry');
    (marker === '@revoked' ? revoked : allowed).push(Buffer.from(fields[2], 'base64'));
  }
  if (!allowed.length) throw new Error('No trusted known_hosts entry for proxy');
  return key => !revoked.some(k => k.equals(key)) && allowed.some(k => k.equals(key));
}

function createClient(options) {
  const key = utils.parseKey(options.privateKey);
  if (key instanceof Error) throw new Error('Unable to read proxy private key');
  const modern = publicKeyForSHA2(key, options.signatureAlgorithm || 'rsa-sha2-512');
  const verify = hostVerifier(options.knownHosts, options.host, options.port);
  let attempted = false;
  const client = new Client();
  const config = {
    host:options.host, port:options.port, username:options.username || 'fhem',
    hostVerifier:verify, readyTimeout:options.timeout || 15000,
    keepaliveInterval:90000, keepaliveCountMax:3,
    algorithms:{serverHostKey:['rsa-sha2-512','rsa-sha2-256'],
      hmac:['hmac-sha2-512-etm@openssh.com','hmac-sha2-256-etm@openssh.com','hmac-sha2-512','hmac-sha2-256']},
    authHandler() {
      if (attempted) return false;
      attempted = true;
      return {type:'publickey', username:options.username || 'fhem', key:modern};
    }
  };
  return {client, config};
}

async function execute(options, command) {
  if (!/^(status(?: version=[A-Za-z0-9_.-]+)?|register keyhash=[a-f0-9]{64}|unregister)$/.test(command))
    throw new Error('Unsupported proxy command');
  const {client, config} = createClient(options);
  return new Promise((resolve,reject)=>{
    let done = false;
    const finish = (error,result)=>{
      if (done) return; done=true; clearTimeout(timer); client.destroy();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(()=>finish(new Error('Proxy command timed out')), options.timeout || 15000);
    client.once('error',error=>finish(error));
    client.once('close',()=>{if(!done) finish(new Error('Proxy connection closed before command completed'));});
    client.once('ready',()=>client.exec(command,(error,stream)=>{
      if (error) return finish(error);
      let stdout='',stderr='',size=0;
      const data = (which,chunk)=>{
        size+=chunk.length;
        if (size>32768) return finish(new Error('Proxy response size limit exceeded'));
        if(which==='stdout') stdout+=chunk.toString('utf8'); else stderr+=chunk.toString('utf8');
      };
      stream.on('data',chunk=>data('stdout',chunk));
      stream.stderr.on('data',chunk=>data('stderr',chunk));
      stream.once('error',error=>finish(error));
      stream.once('close',status=>finish(null,{status:status===undefined?null:status,stdout,stderr}));
    }));
    client.connect(config);
  });
}

function tunnel(options, localHost, localPort) {
  if (!['127.0.0.1','::1'].includes(localHost)) throw new Error('Proxy destination must be loopback');
  if (!Number.isInteger(localPort) || localPort<1 || localPort>65535) throw new Error('Invalid local proxy port');
  const {client, config} = createClient(options);
  // Same event contract as the previous child process, entirely in-process.
  const handle = new EventEmitter();
  handle.retryable = false;
  handle.stdout = new PassThrough(); handle.stderr = new PassThrough();
  const sockets = new Set();
  let done=false, requestedStop=false, acknowledged=false, welcomed=false, announced=false;
  let banner='';
  const timer=setTimeout(()=>fail(new Error('Proxy tunnel startup timed out')), options.timeout || 15000);
  const finish=code=>{
    if(done)return;done=true;clearTimeout(timer);
    for(const socket of sockets) socket.destroy();
    client.destroy();handle.stdout.end();handle.stderr.end();handle.emit('close',code);
  };
  const fail=error=>{
    if(done)return;
    handle.retryable = handle.retryable || error.level === 'client-timeout' ||
      ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','EAI_AGAIN'].includes(error.code);
    handle.stderr.write('Native SSH tunnel failed: '+(error.level || error.code || 'connection')+'\n');
    finish(1);
  };
  const announce=()=>{
    if(acknowledged && welcomed && !announced) {
      announced=true;clearTimeout(timer);handle.stdout.write('Welcome at the reverse proxy\n');
    }
  };
  const interrupted=()=>{if(!done) {handle.retryable=!requestedStop;finish(requestedStop?0:1);}};
  handle.kill=()=>{requestedStop=true;handle.retryable=false;finish(0);};
  client.on('error',fail);
  client.on('close',interrupted);
  client.on('tcp connection',(info,accept,reject)=>{
    if(done || !acknowledged || info.destPort!==1234 || !['localhost','127.0.0.1','::1'].includes(info.destIP)) return reject();
    const local=net.connect(localPort,localHost);sockets.add(local);
    const stream=accept();
    local.once('connect',()=>{stream.pipe(local);local.pipe(stream);});
    local.on('error',()=>{stream.destroy();});
    stream.on('error',()=>local.destroy());
    local.on('close',()=>{sockets.delete(local);stream.destroy();});
    stream.on('close',()=>local.destroy());
  });
  client.once('ready',()=>{
    client.shell(false,(error,stream)=>{
      if(error)return fail(error);
      stream.on('error',fail);
      stream.on('close',interrupted);
      stream.on('data',data=>{
        if(done)return;
        banner+=data.toString('utf8');
        const retry = banner.match(/\(retry:\s*(\d+) seconds\)/);
        if(retry) {
          handle.retryable=true;
          handle.emit('retry',Math.min(86400,Math.max(1,Number(retry[1]))));
          banner=banner.slice(retry.index+retry[0].length);
        }
        if(banner.includes('Welcome at the reverse proxy')) {
          welcomed=true;announce();banner='';
        }
        if(welcomed) banner=banner.slice(-256);
        else if(banner.length>8192) fail(new Error('Oversized proxy greeting'));
      });
      client.forwardIn('localhost',1234,error=>{
        if(error)return fail(error);acknowledged=true;announce();
      });
    });
  });
  process.nextTick(()=>{if(!done)client.connect(config);});
  return handle;
}

function enabled(proxy) {
  if (!proxy.transport || proxy.transport === 'native-sha2') return true;
  if (proxy.transport === 'openssh') return false;
  throw new Error('Unsupported SSH proxy transport');
}

function fromConfig(proxy, directory) {
  return {host:'fhem-va.fhem.de',port:58824,username:'fhem',
    privateKey:fs.readFileSync(path.join(directory,'id_rsa')),
    knownHosts:fs.readFileSync(path.join(directory,'known_hosts'),'utf8'),
    signatureAlgorithm:proxy.signatureAlgorithm || 'rsa-sha2-512',timeout:15000};
}

function requireExistingRegistration(registered,readings) {
  if (!registered || !readings || !['alexaFHEM.bearerToken','alexaFHEM.skillRegKey']
      .every(name=>readings[name] && typeof readings[name].Value==='string' && readings[name].Value.length))
    throw new Error('Existing Alexa registration required; no automatic registration changes');
}

module.exports = {publicKeyForSHA2, hostVerifier, execute, tunnel, enabled, fromConfig, requireExistingRegistration};
