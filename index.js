const fs = require('fs')
const leb = require('leb')
const lzma = require('lzma')
const int64 = require('int64-buffer')

const EPOCH = 621355968000000000

class Replay{
	constructor(){
		this.gameMode = 0
		this.gameVersion = 0
		this.beatmapMD5 = ''
		this.playerName = ''
		this.replayMD5 = ''
		this.number_300s = 0
		this.number_100s = 0
		this.number_50s = 0
		this.gekis = 0
		this.katus = 0
		this.misses = 0
		this.score = 0
		this.max_combo = 0
		this.perfect_combo = 0
		this.mods = 0
		this.life_bar = ''
		this.timestamp = 0
		this.replay_length = 0
		this.replay_data = ''
		this.unknown = 0
	}

	serializeSync(){
		return _serialize(this)
	}

	serialize(cb){
		return _serialize(this, cb)
	}
}

function readSync(input){
	return _read((input instanceof Buffer) ? input : fs.readFileSync(input))
}
function read(input,cb){
	if(input instanceof Buffer){
		return _read(input,cb)
	}else{
		fs.readFile(input, (err,data) => {
			if(err) return cb(err, null)
			return _read(data,cb)
		})
	}
}

function _serialize(data, cb){	
	try{
		let gameMode = new Buffer([data.gameMode])
		let gameVersion = writeInteger(data.gameVersion)
		let beatmapMD5 = writeString(data.beatmapMD5)
		let playerName = writeString(data.playerName)
		let replayMD5 = writeString(data.replayMD5)
		
		let number_300s = writeShort(data.number_300s || 0)
		let number_100s = writeShort(data.number_100s || 0)
		let number_50s = writeShort(data.number_50s || 0)

		let gekis = writeShort(data.gekis || 0)
		let katus = writeShort(data.katus || 0)
		let misses = writeShort(data.misses || 0)

		let score = writeInteger(data.score || 0)
		let max_combo = writeShort(data.max_combo || 0)
		let perfect_combo = new Buffer([data.perfect_combo] || [0x01])

		let mods = writeInteger(data.mods)
		let life_bar = writeString(data.life_bar || '')

		let timestamp = writeLong((data.timestamp || new Date()).getTime()*10000+EPOCH)

		if(typeof cb === 'undefined'){
			// sync
			let replay_data = Buffer.from(lzma.compress(data.replay_data || ''))
			let replay_length = writeInteger(replay_data.length)
			let unknown = writeLong(data.unknown || 0)

			return Buffer.concat([gameMode, gameVersion, beatmapMD5, playerName, replayMD5,
				number_300s, number_100s, number_50s, gekis, katus, misses, score, max_combo, perfect_combo,
				mods, life_bar, timestamp, replay_length, replay_data, unknown])
		}else{
			// async
			lzma.compress(data.replay_data || '', 1, (res, err) => {
				let replay_data = Buffer.from(res)
				let replay_length = writeInteger(replay_data.length)
				let unknown = writeLong(data.unknown || 0)

				return cb(err == 0 ? null : err,Buffer.concat([gameMode, gameVersion, beatmapMD5, playerName, replayMD5,
					number_300s, number_100s, number_50s, gekis, katus, misses, score, max_combo, perfect_combo,
					fmods, life_bar, timestamp, replay_length, replay_data, unknown]))
			})
		}
	}catch(err){
		if(typeof cb === 'undefined'){
			throw err
		}else{
			return cb(err, null)
		}
	}

	function writeString(text){
		if(text.length != 0){
			return Buffer.concat([Buffer.from([0x0b]), leb.encodeUInt32(text.length), Buffer.from(text)])
		}else{
			return Buffer.from([0x00])
		}
	}
	function writeInteger(int){
		let buffer = Buffer.alloc(4)
		buffer.writeInt32LE(int)
		return buffer
	}
	function writeShort(short){
		let buffer = Buffer.alloc(2)
		buffer.writeUIntLE(short, 0, 2)
		return buffer
	}
	function writeLong(long){
		return int64.Uint64LE(long).toBuffer()
	}
}
function _read(buff, cb){
	let offset = 0x00
	let replay = new Replay()
	try{
		replay.gameMode = readByte(buff)
		replay.gameVersion = readInteger(buff)
		replay.beatmapMD5 = readString(buff)
		replay.playerName = readString(buff)
		replay.replayMD5 = readString(buff)

		replay.number_300s = readShort(buff)
		replay.number_100s = readShort(buff)
		replay.number_50s = readShort(buff)

		replay.gekis = readShort(buff)
		replay.katus = readShort(buff)
		replay.misses = readShort(buff)

		replay.score = readInteger(buff)
		replay.max_combo = readShort(buff)

		replay.perfect_combo = readByte(buff)

		replay.mods = readInteger(buff)
		replay.life_bar = readString(buff,1)
		replay.timestamp = new Date((readLong(buff)-EPOCH)/10000)
		replay.replay_length = readInteger(buff)

		if(typeof cb === 'undefined'){
			replay.replay_data = readCompressedSync(buff, replay.replay_length)
			replay.unknown = readLong(buff)
			return replay
		}else{
			readCompressed(buff, replay.replay_length, (res, err) => {
				replay.replay_data = res
				replay.unknown = readLong(buff)
				cb(err == 0 ? null : err, replay)
			})
		}
	}catch(err){
		if(typeof cb === 'undefined'){
			throw err
		}else{
			return cb(err, null)
		}
	}

	function readByte(buffer){
		offset++
		return buffer.readInt8(offset-1)
	}
	function readShort(buffer){
		offset += 2;
		return buffer.readUIntLE(offset-2, 2);
	}
	function readInteger(buffer){
		offset += 4;
		return buffer.readInt32LE(offset-4);
	}
	function readLong(buffer){
		offset += 8;
		return new int64.Uint64LE(buffer.slice(offset-8, offset)).toNumber();
	}
	function readString(buffer, additionalOffset = 0){
		if(buffer.readInt8(offset) == 0x0b){
			offset++
			let strLength = leb.decodeUInt32(buffer.slice(offset, offset+2)).value
			if(strLength == 0) additionalOffset = 0	//workaround i guess
			offset += strLength+1+additionalOffset
			return buffer.slice(offset-strLength, offset).toString()
		}else{
			offset++
			return ''
		}
	}
	function readCompressed(buffer, length, cb){
		offset += length
		return lzma.decompress(buffer.slice(offset-length, offset), cb)
	}
	function readCompressedSync(buffer, length){
		offset += length
		return lzma.decompress(buffer.slice(offset-length, offset))
	}
}

module.exports.Replay = Replay
module.exports.readSync = readSync
module.exports.read = read