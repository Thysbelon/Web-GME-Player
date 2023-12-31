#include <stdlib.h>
#include <stdio.h>

#include <gme.h>
#include <emscripten/emscripten.h>

//#include <math.h> //for sin

void handle_error( const char* str );
int track;
//int limitlogs=0;
const int BUFFERSIZE=2048; // to do: figure out a way to link up this const and the BUFFERSIZE const in javascript, so changing one changes the other
short buf[BUFFERSIZE]; // array of signed int 16s
Music_Emu* emu;

//static void play_siren( long count, short* out )
//	{
//		static double a, a2;
//		while ( count-- )
//			*out++ = 0x2000 * sin( a += .1 + .05*sin( a2+=.00005 ) );
//	}

EMSCRIPTEN_KEEPALIVE
short* playMus() {
	/* Sample buffer */
	handle_error( gme_play( emu, BUFFERSIZE, buf ) );
	//if (limitlogs<1) {
	//	short tempbuf [buf_size];
	//	size_t n = sizeof(tempbuf)/sizeof(tempbuf[0]);
	//	printf("total size of buf: %zu\n", sizeof(tempbuf));
	//	printf("number of elements in buf: %zu\n", n);
	//	printf("size of buf_size: %d\n", buf_size);
	//	printf("size of buf_size times 2: %d\n", buf_size*2);
	//	printf("size of one element in buf: %lu\n", sizeof(buf[1]));
	//	++limitlogs;
	//}
	//play_siren(BUFFERSIZE, buf);
	/*if (limitlogs < 50) {
		handle_error( gme_play( emu, buf_size, buf ) );
		printf("array buf entry number 0: %d\n", buf[0]);
		printf("array buf entry number 1: %d\n", buf[1]);
		printf("array buf entry number 2: %d\n", buf[2]);
		printf("array buf entry number 3: %d\n", buf[3]);
		printf("array buf entry number 4: %d\n", buf[4]);
		printf("array buf entry number 5: %d\n", buf[5]);
		++limitlogs;
	} else {
		gme_play( emu, buf_size, buf );
	}*/
	
	// the c code cannot return an array to javascript, use runtime method getValue to access the buf array.
	return buf; //buf is a pointer, c arrays are pointers.
}

EMSCRIPTEN_KEEPALIVE
int setupMusStereo(int tracknum, int sample_rate)
{
	printf("setupMusStereo called. int tracknum: %i, int sample_rate: %i \n", tracknum, sample_rate );
				
	track = tracknum;
		
	/* Open music file in new emulator */
	handle_error( gme_open_file( "/home/web_user/input" /* extension should not be neccessary */, &emu, sample_rate ) );
	
	gme_ignore_silence( emu, 1 ); // very important for recording separate tracks. 1 is true
	
	// to do: put these printfs in a define DEBUG
	int totalvoices=gme_voice_count( emu );
	
	printf("voice count: %d\n", totalvoices);
	
	for (int i=0;i<totalvoices;++i) {
		printf("voice name %d: %s\n", i, gme_voice_name( emu, i ));
	}
	
	gme_info_t* info;
	
	gme_track_info( emu, &info, tracknum );
	
	printf("info: song: %s, length: %d, intro_length: %d, loop_length: %d, play_length: %d, fade_length: %d, system: %s\n", info->song, info->length, info->intro_length, info->loop_length, info->play_length, info->fade_length, info->system);
	
	int length=info->length;
	
	if (length == -1) {
		printf("file length is undefined, try adding intro_length and loop_length\n");
		length = info->intro_length + info->loop_length;
		printf("new length: %d\n", length);
	}
	
	gme_free_info(info);
	if (sample_rate != gme_info_only) {
		handle_error( gme_start_track( emu, tracknum ) );
	}
	
	printf("setupMusStereo done\n");
	return length;
}

EMSCRIPTEN_KEEPALIVE
int getTotalVoices() {
	return gme_voice_count( emu ); // making a tiny function like this is easier than figuring out how to return length and total voices in the setupNSFstereo function.
}

EMSCRIPTEN_KEEPALIVE
const char* getSystem() { // run after setup
	gme_info_t* info;
	gme_track_info( emu, &info, track );
	const char* system = info->system;
	printf("info->system: %s, system: %s\n", info->system, system);
	gme_free_info(info);
	return system;
}

EMSCRIPTEN_KEEPALIVE
int getIntroLength() { // run after setup
	gme_info_t* info;
	gme_track_info( emu, &info, track );
	int intro_length = info->intro_length;
	printf("info->intro_length: %d, intro_length: %d\n", info->intro_length, intro_length);
	gme_free_info(info);
	return intro_length;
}

EMSCRIPTEN_KEEPALIVE
int GMEend() {
	printf("Deleting emu of type %s.\n", gme_type_system( gme_type(emu) ) );
	//printf("pointer of emu: %p.\n", emu );
	gme_delete( emu );
	printf("Deleted emu\n");
	return 0;
}

EMSCRIPTEN_KEEPALIVE
const char* getVoiceName(int voicenum) {
	return gme_voice_name(emu, voicenum);
}

EMSCRIPTEN_KEEPALIVE
int setVoiceForRecording(int voicenum)
{
	printf("setVoiceForRecording with voicenum: %d, name: %s\n", voicenum, gme_voice_name( emu, voicenum ));
	
	if (gme_tell(emu)>0) {
		printf("Time is greater than 0. Seeking to start...\n");
		gme_seek( emu, 0 ); // causes error when length value is too low and panningObject specifies voices that never play in that length
		/*RuntimeError: index out of bounds
		createExportWrapper http://localhost:8000/gmeplayer.js:689
		ccall http://localhost:8000/gmeplayer.js:4239
		cwrap http://localhost:8000/gmeplayer.js:4258
		gmeplay http://localhost:8000/gmeplay-function.js:89 */
		//printf("Seek to start finished, new time: %d\n", gme_tell(emu));
		printf("Seek to start finished\n");
	}
	
	gme_mute_voices( emu, -1 ); // mute all voices
	
	gme_mute_voice( emu, voicenum, 0 ); // unmute
	
	printf("setVoiceForRecording done\n");
	return 0;
}

EMSCRIPTEN_KEEPALIVE
int unmuteVoice(int voicenum)
{
	printf("unmuteVoice with voicenum: %d, name: %s\n", voicenum, gme_voice_name( emu, voicenum ));
	
	gme_mute_voice( emu, voicenum, 0 ); // unmute
	
	printf("unmuteVoice done\n");
	return 0;
}

void handle_error( const char* str )
{
	if ( str )
	{
		printf( "Error: %s\n", str ); //getchar();
		//exit( EXIT_FAILURE );
	}
}