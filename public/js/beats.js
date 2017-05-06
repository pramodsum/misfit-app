var events = new Events();

var AudioHandler = function() {

	var waveData = []; //waveform - from 0 - 1 . no sound is 0.5. Array [binCount]
	var levelsData = []; //levels of each frequecy - from 0 - 1 . no sound is 0. Array [levelsCount]
	var level = 0; // averaged normalized level from 0 - 1
	var bpmTime = 0; // bpmTime ranges from 0 to 1. 0 = on beat. Based on tap bpm
	var ratedBPMTime = 550;//time between beats (msec) multiplied by BPMRate
	var levelHistory = []; //last 256 ave norm levels
	var bpmStart;

	var BEAT_HOLD_TIME = 40; //num of frames to hold a beat
	var BEAT_DECAY_RATE = 0.88;
	var BEAT_MIN = 0.15; //a volume less than this is no beat

	//BPM STUFF
	var count = 0;
	var msecsFirst = 0;
	var msecsPrevious = 0;
	var msecsAvg = 633; //time between beats (msec)

	var timer;
	var gotBeat = false;
	var beatCutOff = 0;
	var beatTime = 0;
	var scl = 0;

	var freqByteData; //bars - bar data is from 0 - 256 in 512 bins. no sound is 0;
	var timeByteData; //waveform - waveform data is from 0-256 for 512 bins. no sound is 128.
	var levelsCount = 16; //should be factor of 512

	var binCount; //512
	var levelBins;

	var isPlayingAudio = false;

	var source;
	var buffer;
	var audioBuffer;
	var dropArea;
	var audioContext;
	var analyser;

	function init() {
		//EVENT HANDLERS
		events.on("update", update);

		//Get an Audio Context
		try {
			window.AudioContext = window.AudioContext || window.webkitAudioContext;
			audioContext = new window.AudioContext();
		} catch(e) {
			//Web Audio API is not supported in this browser
			$('#info').append('Sorry!<br>This browser does not support the Web Audio API. Please use Chrome, Safari or Firefox.');
			$('#controls').hide();
			return;
		}

		analyser = audioContext.createAnalyser();
		analyser.smoothingTimeConstant = 0.8; //0<->1. 0 is no time smoothing
		analyser.fftSize = 1024;
		analyser.connect(audioContext.destination);
		binCount = analyser.frequencyBinCount; // = 512

		levelBins = Math.floor(binCount / levelsCount); //number of bins in each level

		freqByteData = new Uint8Array(binCount);
		timeByteData = new Uint8Array(binCount);

		var length = 256;
		for(var i = 0; i < length; i++) {
		    levelHistory.push(0);
		}

		getMicInput();
		setInterval(update, 5);

		onBMPBeat();
		msecsAvg = 640;
		timer = setInterval(onBMPBeat,msecsAvg);
	}

	function getMicInput() {
		//x-browser
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

		if (navigator.getUserMedia ) {
			navigator.getUserMedia(
				{audio: true},

				function(stream) {
					//reinit here or get an echo on the mic
					source = audioContext.createBufferSource();
					analyser = audioContext.createAnalyser();
					analyser.fftSize = 1024;
					analyser.smoothingTimeConstant = 0.3;

					microphone = audioContext.createMediaStreamSource(stream);
					microphone.connect(analyser);
					isPlayingAudio = true;
				},

				// errorCallback
				function(err) {
					alert("The following error occured: " + err);
				}
			);

		}else{
			alert("Could not getUserMedia");
		}
	}

	function onBMPBeat(){
		//console.log("onBMPBeat");
		bpmStart = new Date().getTime();

		//only fire bpm beat if there was an on onBeat in last timeframe
		//experimental combined beat + bpm mode
		//if (gotBeat){
			gotBeat = false;
		//}

	}

	//called every frame
	//update published viz data
	function update(){

		if (!isPlayingAudio) return;

		//GET DATA
		analyser.getByteFrequencyData(freqByteData); //<-- bar chart
		analyser.getByteTimeDomainData(timeByteData); // <-- waveform

		//normalize waveform data
		for(var i = 0; i < binCount; i++) {
			waveData[i] = ((timeByteData[i] - 128) / 128);
		}
		//TODO - cap levels at 1 and -1 ?

		//normalize levelsData from freqByteData
		for(var i = 0; i < levelsCount; i++) {
			var sum = 0;
			for(var j = 0; j < levelBins; j++) {
				sum += freqByteData[(i * levelBins) + j];
			}
			levelsData[i] = sum / levelBins / 256; //freqData maxs at 256

			//adjust for the fact that lower levels are percieved more quietly
			//make lower levels smaller
			levelsData[i] *=  1 + (i / levelsCount) / 2;
		}
		//TODO - cap levels at 1?

		//GET AVG LEVEL
		var sum = 0;
		for(var j = 0; j < levelsCount; j++) {
			sum += levelsData[j];
		}

		level = sum / levelsCount;

		levelHistory.push(level);
		levelHistory.shift(1);

		//BEAT DETECTION
		if (level  > beatCutOff && level > BEAT_MIN){
			getLastFreq();
			beatCutOff = level * 1.1;
			beatTime = 0;
		} else{
			if (beatTime <= BEAT_HOLD_TIME){
				beatTime ++;
			}else{
				beatCutOff *= BEAT_DECAY_RATE;
				beatCutOff = Math.max(beatCutOff,BEAT_MIN);
			}
		}

		bpmTime = (new Date().getTime() - bpmStart) / msecsAvg;
		//trace(bpmStart);
	}

	function getLastFreq() {
		const level = levelHistory.length ? levelHistory[levelHistory.length - 1] : 0;
		var gotoScale = level * 1.2 + 0.1;
		scl += (gotoScale - scl) / 3;

		var color = hexToRgb('#'+Math.random().toString(16).substr(-6));
		if (bpmTime <= 0.3) {
			return;
		}

		$.ajax({
			headers : {
				'Accept' : 'application/json',
				'Content-Type' : 'application/json'
			},
			url : 'http://localhost:3000/254e381abc4b4d5cb3612817acba6345',
			type : 'PATCH',
			data : JSON.stringify({
				"red": color.r,
				"green": color.g,
				"blue": color.b,
				"brightness": 100,
				"saturation": 100
			}),
			success : function(response, textStatus, jqXhr) {
					console.log("Successfully Patched!");
			},
			error : function(jqXHR, textStatus, errorThrown) {
					// log the error to the console
					console.log("The following error occured: " + textStatus, errorThrown);
			}
		});

		init();
	}

	function onBeat(){
		gotBeat = true;
	}

	function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

	return {
		update:update,
		init:init,
		getMicInput:getMicInput,
	};

}();
