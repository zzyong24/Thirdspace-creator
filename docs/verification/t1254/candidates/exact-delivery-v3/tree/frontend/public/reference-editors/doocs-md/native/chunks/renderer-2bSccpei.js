import { n as e } from "./rolldown-runtime-WOOOH1Hs.js";
import { D as t, E as n, O as r, _ as i, a, c as o, d as s, f as c, h as l, i as u, k as d, l as f, o as p, p as m, s as h, v as g, y as ee } from "./utils-D7O4F-LG.js";
import { t as _ } from "./highlight-ZqbupznI.js";
function v(e, t) {
	return t.some(([t, n]) => t <= e && e <= n);
}
function y(e) {
	return typeof e == "string" && v(e.charCodeAt(0), [
		[12352, 12447],
		[19968, 40959],
		[44032, 55203],
		[131072, 191456]
	]);
}
function b(e) {
	return typeof e == "string" && " \n\r	".includes(e);
}
function x(e) {
	return typeof e == "string" && v(e.charCodeAt(0), [
		[33, 47],
		[58, 64],
		[91, 96],
		[123, 126],
		[12288, 12351],
		[65280, 65519]
	]);
}
function S(e, t = {}) {
	let n = 0, r = 0, i = e.length - 1, a = t.wordsPerMinute || 200, o = t.wordBound || b;
	for (; o(e[r]);) r++;
	for (; o(e[i]);) i--;
	let s = `${e}\n`;
	for (let e = r; e <= i; e++) if ((y(s[e]) || !o(s[e]) && (o(s[e + 1]) || y(s[e + 1]))) && n++, y(s[e])) for (; e <= i && (x(s[e + 1]) || o(s[e + 1]));) e++;
	let c = n / a, l = Math.round(c * 60 * 1e3);
	return {
		text: `${Math.ceil(Number(c.toFixed(2)))} min read`,
		minutes: c,
		time: l,
		words: n
	};
}
var te = [
	8364,
	0,
	8218,
	402,
	8222,
	8230,
	8224,
	8225,
	710,
	8240,
	352,
	8249,
	338,
	0,
	381,
	0,
	0,
	8216,
	8217,
	8220,
	8221,
	8226,
	8211,
	8212,
	732,
	8482,
	353,
	8250,
	339,
	0,
	382,
	376
];
function C(e) {
	return e === 0 || e >= 55296 && e <= 57343 || e > 1114111;
}
function ne(e) {
	return C(e) ? 65533 : e >= 128 && e <= 159 && te[e - 128] || e;
}
function re(e) {
	return e - 1 >>> 0 < 127 || e - 160 >>> 0 < 55136 ? String.fromCharCode(e) : String.fromCodePoint(ne(e));
}
var w = /* #__PURE__ */ (() => {
	let e = /* @__PURE__ */ new Uint8Array(127), t = 0;
	for (let n = 33; n <= 126; n++) n !== 34 && n !== 36 && n !== 92 && (e[n] = t++);
	return e;
})();
function ie(e, t, n, r, i, a) {
	let o = e.length, s = a * 90, c = 0, l = () => {
		let t = w[e.charCodeAt(c++)];
		return t < a ? t : t * 91 - s + w[e.charCodeAt(c++)];
	}, u = n - r, d = n + i, f = new Int32Array(d);
	f.fill(-1, r, a), f.fill(-1, a + u, d);
	let p = new Int32Array(d), m = new Int32Array(d);
	function h(t, n) {
		let r = 0, i = n, a = n + t;
		for (; i < a;) {
			let t = w[e.charCodeAt(c++)];
			if (t < 89) r += t, f[i++] = r;
			else if (t === 89) {
				let t = w[e.charCodeAt(c++)] + 2;
				for (; t--;) f[i++] = ++r;
			} else {
				let t = w[e.charCodeAt(c++)];
				r += 89 + (t < 90 ? t * 91 + w[e.charCodeAt(c++)] : w[e.charCodeAt(c++)] * 8281 + w[e.charCodeAt(c++)] * 91 + w[e.charCodeAt(c++)]), f[i++] = r;
			}
		}
	}
	h(r, 0), h(u, a);
	let g = new Int32Array(i * 2), ee = 0, _ = 0;
	function v(e, t) {
		for (let n = 0; n < e; n++) {
			let e = t + n, r = l(), i = l();
			g[_ * 2] = r, g[_ * 2 + 1] = i, _ += 1, p[e] = ee;
			let a = (f[r] < 0 ? m[r] : 1) + (f[i] < 0 ? m[i] : 1);
			m[e] = a, ee += a;
		}
	}
	v(i - a + r, a + u), v(a - r, r);
	let y = new Uint16Array(ee), b = 0;
	for (let e = 0; e < _; e++) for (let t = 0; t < 2; t++) {
		let n = g[e * 2 + t], r = f[n];
		if (r < 0) {
			let e = p[n], t = e + m[n];
			for (; e < t;) y[b++] = y[e++];
		} else y[b++] = r;
	}
	let x = new Uint16Array(t), S = 0;
	for (; c < o;) {
		let t = w[e.charCodeAt(c++)];
		t >= a && (t = t * 91 - s + w[e.charCodeAt(c++)]);
		let n = f[t];
		if (n < 0) {
			let e = p[t], n = e + m[t];
			for (; e < n;) x[S++] = y[e++];
		} else x[S++] = n;
	}
	return x;
}
var ae = /* #__PURE__ */ ie("!}.&u%}'&}*'~!6*)%&,~!J~!J~%L~y<~!R,~~%Lu~~#GD~~#|)1#%}^%}2%+#.##%##%}&%##%'#%##&%#%#'%#&#%#&#'#%%#&#%##%#)%''%&%#%#'%#%%#%%}%%%#%#&(23#%%#&-%0%('1#(##%#'##+%'*.:1}#%#6-+(%'%%#%%%}#L'2351&('%}&/N'(0(/*-%(%%}#'+&T%7.2}#&%&#%#36/5##%&%%#&#%%#))2%%##%&&'0~!#*+&'%1~!%).'3q?&%'1~!.##%6(~!+%%%(Gw'rT~!E#<nA%#jZ~!H%(~!42##~!*31&~!G%U~#)5~#`3~!J~!Z~%]~%Y~%C~!q~!u~#kz~%#~!6'~!D~!U~!?~#T~!c%~!G#'~%7|~!G~!J~!G&~#pb~(Df}#%}*&}#%##%##%##&#-}&'#'&%#.++}%mI,#,@&(}*%}*'%&##&#%##%}&0}#.},U},%}+%}&%}#%##&}B%(}(%}+%)})%##%#&}&%##%&}<%}>%#%&}*%}(%}9%}/%})%}*%}*%}?&}&%}3%}&*#%})%#%#)}#&#-#+*%E%%'%'#%}#*V##&##I}#&&##%&%#&&Qf%%))w/0+&%#(#.%-''''++++7}>%4'',##1,#%#&%##&#'##&#*#9)%&%}#*}%,#+P(%A&%#'&##wSD',9E00#y#@}(+}&%&>~!#~!X}#*}(&&}(&}(,%}%&#+&}#&}I%#%}%)#(},'%#*}4%%#%}(''}#/##(##),%-##%%)#&}(.}&%#&}%%}*&#%},&&}&%}#%*'#%})%}D&}&%}-&}6&#&}-,%}#%})-(~+`~,=?~I9'9%~!,#%})%})%}@%}?%}(~!?~#<~#pP~#BG~#=1#%K+~#?#~%;)~#A~#mF1~#A'~'X%'~#lR~#N~'N~#r~#m#-~#i'?%#'%~#B%##%,%#~#_%#0%~#]732~,w~2+#:&#%&'0%&>%}#>##F+)#%&&#(+_}4&}-%}(&}@&}O7Fdf0@+/v4}&WU##&/0#&'('B#%}.%}'+#%}#%%&#&%#%##+#&#)#6#'#.},%}c%},%#%##%&#&%#&~#>'*-.%##%##%}#%%}%'~#)D1}#%*&~#_%%'(~#S2%'.}#~#=##*'*-%}&'%'##&&~'E%.#&~#M4}%%##&'%#~#O1##%&#'+~#<B%##%%'%+~#;#@%}#&%#&&%#(~#H1}'%'##&&~#?A}&'~#D#%32}'&&&&~#[}'(#%}'~#;C})&}%%#%~#=&%,3}%'(#%%~#^'#&&)#%'~#Y%-~#d-%'~#^%%&#&&&}#~#b~2t*&'~&(~&@~0%~e~3}%*''0})&}+~!9##-}#%-hD*)1fC#%/&/fB#40~!+#)*4~!+~!K'&:~!/*7~!.#~!H~!L':~%x&~!H#~!*~%1~!I#~!+A~#p'~!F~~#-#~,,(~.Z~!V~%;'B'mq-W~!N~%I%#&&#&}#%},%%}'%}+X#%}#&}(%}'%}<%}#%}%%'}'%}:~![)9@~%>~#UA%-%##&~!C%~!-.9:~!1~!-^2/:a~!y,D*J#-5)/4~%23,~#G~!L1~!0X3`~!2+~!!0-~&E~!W~!o,>Y&]~%cZx_&~#O*9#A#'#+I'%#)~!0B*-5A+-((F&*M#)(-7-5+'-3a5Vi~!Y~!?+[)%3),ERHm~!+:D,VG.+)?fB%%*(%)'(#&80%1'8`K8?`+'Z#&O&'H5#*9)A%%5&3))0%39+.*7#()&&*=4@**L)<'_&*+..;(#*+)./&0#3)%')-8(4ixD(&.}%,('aI:,)%,k2231T)I'#/-W7,/'Q#.'Y24+h')37</31&83##&0#),H(?'&?/1##%#&&#%''-%&&&#(&''&#.-'%#%%(,')*'&#&#'##%(%(#%('#&##%%%%('%#%#%%#%#&%##h>w+v<ayvyvcg.uuhKr}g/v|g>u9i[~>g5uI~=RvdwEg;v/g;uk!!TTSx]@RT!U!#!@VBRUU!'UTe-d0c`e&gSdicedFcrdTaqb.kYcAohdYd@a3e+d}dMdtd.aJ#bqcK`dle/e.e'dwdPdodddjbEb}ogd^ofdpduc6j?l%d{drdqc)d7bacOdQ%T#Y)X.sR[yH>6Vyv3[xwLu>vo'!*.[yBacahoj>6Rew3[xqdZa#!a&#^(X-[yG>6Vyu3[xvg3sEr|g.u/Ri9db0T#^(Xa)!-[y;>6Vylg4wKs{JwNZt3@3r=c4Z([xlg;wKt!cpq's@v7A'*a(a+!-a#[y<3Dt?3Dt'>6Vym3[xmg9rxsNJwLZt4~?r?db1T#`-!(Xa,!0[yS>6Vz%NuQs.g4wKtnJwNZtS@3r>c4Z([y%g;wKtrdga8!a(!#&T*Y-Xa#!a0<or[yc3Dtq>6Vz43[y3JwNZtf@3s!Ju}!%Dti:pm3c_%X#tjB5pkd6q!r]u?voC'*-a.a2!0a&a+[yI3DtI3Ds~3DtH>6Vyw3[xx;:s#~<5pKJwNZtE@3r~d`a)!a2T#a.(!+U.X1[yT3Dt`3Dtv>6Vz&3[y&g9rxwzcxstPu.<rAJwLZtT~?r@dZa%!a.&^*Za(/Reu[ya>6Vz23[y1g3sEr}wkg{NuQRg{ci(U#5@b`~,cg#U(2WnH5wugcRh7dX#T(Y,a'Ta!!a,[yZ<]mj>6Vz,3[y+Pv#5ReZKu+=,%!H}7ABwkaS?Rh:BcW(X#<]mrj:ubv/ARekdg%!(!a.*Ta(Y.X1!#sP>Rl*Dt6[y>>6Vyo3Wf*jOvuumvuRgRJuq*!:9<B@bX~3jVv&v@s@5Re[d/rQt{uAvo&a&a*)a2!,0Wf!3Dt0=Bs'>6Re}3[xy~<5s%JwJZt1~Gs)c;&!#2sJkNuXvzq7rxu,Re8dka4!a8(aEZ+a@Y.X1Xa)[yd=Bs(3DtP>6Vz53[y4cX#X&Re:avRe9~<5s&JwJZtQ~Gs*i^rzvdRg+Jv{%!2sbB@bX}kdga,!Za?&^*T1/!a'Dt+[y6>6Vyf3Wf%g/u;s4hGu6?Rh-JvZ,!c%#&RoX54Rivj7uyvf8RgTKvZB%*!2sGh<vu5Rgq<=C::9bb~#dZ#T&Ta6Y.X*Dt>[y93Wf)coZ(T,6VyifluvRgC@95@B@bX~/hFu34cC#T,k/unq8w8Q5RkUklwQuzunq8w8Q5Rk8d/rJu?v8w9)-&!a0a;a&aIWejg3sEr/h1s<DtDJvyZqY5aws3Jvy!&Wei~Hr1:au5@Bag>23E~5c:Z&bX};kKv?w&unuVu5Rjc;>bs)#~@:Rh.=ay<a]C;b`}Vd6s/t{uAvoaxa()!a,a7%-a#a2Dt,[yF2Wo[>6Vyt3[xuNuPRi&NuPwpi#RoWh?vf8Ri%Jv]!%Ri:KvxD!.'2WeAjZu`q9rxu,Re7woeAg-unLq(qA_/*2Wg_g3u5q^9:4E}/jTrxrzv=Wkkd~0UX#^^Xa-a1a5T&a=U1a'*aEa]!a*aPaA-adok[y54Rn>;:p3~Dp5g9rpsFNvZqjg3uJp4~<5p0Pw;5qlJwNZt*@3p1Pw:5p/Ou!5p2JvG'!6Vye=<qnJvh_[xhg3v,Rh3kOwOw-sDuev/Re^dha[a%!%!a+#Ta7)-5TaCaO!aka!a)sf[yb2>Rl!9ARiq5E}Qg=ucRkBE|oJrJ_@Wk~@Wk{JrJ_@Wk|@WkyJrJ_@Wk}@WkzJvO_[y2g-vMRmiKuYC!)&>Ri;>Ri<@3RkNc](X#@9Rk=g5vuRmhKvDB!+'=]meg3u4Rmgd)#Y'Vz3CARmfd`a+!%T'!+#Ta1Ta6TaM-sTDt9[yA9sYd'%Y#s[[xpj:ueunaXRgEjRq,v-vuqdd2'`#6Rev<32@5>:2<E}5xIo9a*X#Y(;5RePJvD_g>vyRgNj8w)v8<wggs:RgXiZt|vjx,hSq3ah!-(~@:Ro/Ou!5RhWj^v(pyw8unRhUdx-UY#^Ua.a3a70!)%UX1TaDa)'omRiRRhE[y:3Dsz=Br,>6Vyj3[xkg6ruwjcqsrPw;5r*Ku]D'Zt-@3r(~?r.i[vwv]dU1a--U#`a4(g/vsRhPOu!5RhLj:rmu9Wo!~@:wdh@g/vsRiTjXuvvNr}:RhBj^v(pyw8unRn]dz1UYa'a+^Y(!aETZalaRY.Ta?a4[yDJw1!#qLsW>6Vyrfzq-pLflpwRe|Js>%!Dt@3Dt&Jvy_[xs~HrnjMuwpsw'RecKu+D#'!t<~Grl~?rjg5u-x,gwp{ah!-(~@:Rg~Ou!5Rh'jXuvvNr}:Rh#cW#X/c;&!#2sLi[v7u7RgpJv)(!iLrxu,Re6j7v@s@5Se[e7d`aW!Za(a`T.a#!a3!&aDa-!9)Dt_=6s+3[x~~DR|h~DS6avhGun5RkZj3w)v-]mkKunB!&*]kb97R|i<ARk<c:Z(6Vy}Juh'!wziMRoS:F|vkLuauJv5vtvQRh1d='T+Y#VyO~DR|jcF#T'7R|g97R|kJv3'!ay<Rj,Jvh&!:ReXcsa6*a+#a#_aIRf9aLRf?c,Z&Rf5Rf7c.Z&Rf;Rf>cQ#%T'p-Rf8Rf=ct#%'(*!,p,Rf4p+Rf6Rf:Rf<d~'Ua%U*^UYa(!a,-!#a4YaTalaEX0a8a<Weo3Dt/3Dsx=Br93Wen~Dr;~<5p<JwNZt2@3p=Pw:5p;Ou!5r3c7&!#:p>3Ds}KvGB)_6Vyk2sM=<r7x'eovA(!hFu1ARf}cV#X&@r5j6rvwQa^Rf3c=Za'wkghJv__g;unRggA53B9=b^}%j6uduo5Jq;!(hIv%2Re`Ou4ARe_e%a#^^^Xa&!a*a2!&a6YaP!*ad!#a:aE/5Rn?[y@>6Vyp;:pE~DrY~<5pBJwNZt8@3pCh=rt3rWPw:5pAJup_[xoNuPpF9c!#'45pD5ARn)d8#X'X*3@rU72s]h>v<<sSjJpqvewOJq/(!hNw'5ReBk0s2u3w/w'5ReE5@Jq.!a+JQ!&WeU23d(#Y&RjG5]jBk!u7w&u0udARjEe#+^^^Ub#!a2/a`Z(agT1!a-a;|@TaG!aS[yV=Re~fow'RguNuPRe?bz#'>RoUWeL>:Cbb|?JwPZtVg6ruRmzJvD'!6Vz(g/vmRh~Jvy_[y(g9voRgyx*cy(#2>Ri2B9b]~9kIw9u7rluJu3Rg]dI#a%UY'@=p%CAx.gQZ&RhwwygtRm{x5g_Z'+ABqR9Woa=Bp&dV#^*Xa'!&@o{g4v]Rk;Jv{!%Rk[wkkiA5RkiwwfUB=x,fUuqC&*!>RfTg8v0RfV~ARfSd;rJsAuAv9wR'ae+/aO!a@aza/a#[yQ@Wg!2Wemg3sEr0JvB_g>uvReWg2v+Re=KupB_+[y!2AbY~-~Hr2AJwD!(h<~El>h<~El?Kun@+_:9b`}Kg-v/Ri3g;vtwyk_9]k_d=&T#*U.6qh@Ab`|K9:H|CJv[!&3Dtex'fDwC%!Rf[9WlMd[(^X,!a%Z06Vz!@WgBg=v~Rgvg,QRe@awd,#Y+jTv|Q~EfWj]uNr|~FRfXdy#Y&^Ua%!aO.!(a)Ua;=!a@aKap!a-,a!Ta]a[rSa]p?[y82sK=Bq~;:p:~<5p8Pw:5p7d'#Y'Wf(;RnRi[u4w&RgJJvG'!6Vyh=<r#ijuuv/sIKuYD'ZtG@3p9~Gr&d2#`(g<vtRgFj`u5w&rqpxRf2CJuY!+:wfnTOu!5Rg}jNs1ucv&RfwJvA!&3@q|BDcC#T,k/unq8w8Q5RkTklwQuzunq8w8Q5Rk9dga#!a'!a=#a0!:+Tb*b@aO.a4!aba8aFJv^}?!VyR~Dr<g;u%Rn.~<5p[x'e`wNZtR@3p]Pw:5pZhNvjBp.woe_g5u-r4JwF!%DtO3:ooc7&!#:p^3DtpLuGw(!+%)Dtk6Vz#2sd=<r8d'#Y([y#<x3gJt`w@!)%}MRiowzikRij=]ilxAf3,U(#B2Rf#g0v-Rm[ck{`U#]giKv3>)!&6Ri154s,KuGB_%@r68r:dJ|t`#X(9<E|u2@H|rx3gJu?w'!+'1Nu7Reg4=H~+9<wxgY95Rm]xLggZ-`(X}U2:Ri4h<uOawRmsJv__5@bb{jbV~3dka#a'a]!,#a+U=a>b6a3b%!/aKa/)!arwve^VyJ;:pR~DpTg3uJpS~<5pOPw;5qmPw:5pNOu!5pQJvG'!6Vyx=<qoJvA!{~Jup!%@qk7Rn/KvyD!}''[xz;>wkh'?Rh,x8gyt`w5D!&),(SgyccRgztJ@3pPB5p#d'(Y#<]mmifubw&RgoJvE&!82s^JvF&!8Rf,ADb]~;x=h'rNu]vK!,%'*0RnORh)4Rh*AqQg-vaRnNg;wHwkh'ba~4cE#Ta*x3gctyw@'!+%RnFRnD<4Rn@hFvK5RnCxWg[#`&a0Ua()`1Rm75Rg[c]%X#qi8Rg^NvdRj>BwzgZauwji7Rm6A4wgg]d1#&(*,.0a#Rm;Rm<Rm=Rm>Rm?Rm@RmARmBe%#^^^Xaea?aC/b+(,!a+a#!a/!>a&Ta<aKbD!2wphBRnk[yPw}hE|.=Br-3Dtm>6Vy~g6urRf.x,hPrNav!%'RnqRo%Ro#Nu;q[Pw;5r+JwNZtM@3r)d'#Y'Weh;xChL#`&RnmRnoKu}>%(!Rne~Bs-;2wjcussJv+'!aYSO}6@B<5?ba~8LrNvj!.%*ROwungw~ng~:9;Ri^>wtnig;wHRnixDh@|(UZ.x1h@|)!#:2<H|*xHn]#-UX'3Ro)z=iT}6ARns=Bwsn_wpnaRncw]aR(#UXa&Ua*a/=]iPd'#Y&Ro'WnXf{QRm2hNvj]nZd`'T~&1`{|`#9b]{}c:'!#Wl{>@=be}]?cl{{U#:5Abb}Jds#^YaF!a*b4a#a3aPa>&Tb!bH!*a_!Eau?/a&RjY<]gj>6Vz*;:pe~DrZg,QRj1JwNZtX@wihspcJvZ&!VyX9WmOJu|!|N2WmHJvh&!]ht~Bpbcn&T(!#RmQ<s7Nu;padH#X'`+WmJ@>RmKCARhnKup=!)&Wf+:RhqNuPpf9c!#'45pd5AwghpARn(Ls@w!%,)!RmP@Wfe<E|IJva!&WmNg8vsRmLd`*.`#Y'Xa!axRn*]hrA8Rhug5s@rXg8u!RmMd8#X'X*3@rV72smdI*#UY&RmICARho~GsgxVgd)Ta'U-Y&Xa!T#RnEWnA@Wffg1uDRi0hFvK5RnBxGnG&#`%owp)@wsf+bX}Ze-*1!a*^^^Ua|!#a.aq&Ya2!a>.a6!a:aO`aJDtL[y`@Wg#>6Vz12@wzoYRoZNuPRi!NuPRhzg=ucRi,@=b`{Yg=ucRi-ACJvB!&Sh[ebSh]ebi`wUuFRm4Jw2_[y0JvB!.<Ju(!&SoG}6Shd}6<Ju(!&SoH}6She}6Kur@._g5vHRieJvx!{L2G{Kx6gd'T#?Rh82Wi5cZ#X(g1w)Rm5dW-Y(Ta#!a)!#aYa=wnfE=su2>>bU{0j9udv:<svj8uQv-7RgHdE%#^'sq9sp=>Bb_{TJv`!&g/r|snj6v(us5d,#Y(56H}[978H}]Jw5!&g1rushJvB!+j;v{u5?zDhd}6}bj;v{u5?zDhe}6}ce*#`(^^^a[aea!=!a6a*aoXb1a.!aAbL!b>,b'aL!aV@Wf|2Wlg3[y/JwNZt^@3piPw:5pgJunZou3@rsJva&!Vy_g<v~Rm#JvG'!6Vz0=<r{Ju{%!:pj@WfsiXuJu3Rm:JvZ&!WfA~Bph@c4Z&Dtwax5rubx(#:awRk1@d,#Y&RfjRfid1#,Y(@Wfp2Wlrg5s@ryKu[@!,'=]ig9wlk?Rk>g5u-rqJvy'!@9RkQcH(T#=>Ri~@<wkj(Wj(KuZB*!&<7rw@9RkRcH(T#=>Ri}@<wkj)Wj)dg(Ta2Xa9X#`-!a*CARhg@@=I}d9x;c~#X%so=<sj>2@@=aybb}XjWv0Q~EfEj3vLv;<d,#Y(56H}`978H}_dgaPaFa'a/!#a3Y0a_a;a|!1(a7-[yE3[xt;:pJNvZrrg3uJrvJwNZt=@3pIh=rt3rxPw:5pGOu!5rpJvG'!6Vys=<rz@c4Z&Dt(ax5rtJvZ!&~BpH@wsfNg-vaRlNci*U#=<wei<F}a5@Jq.!a*JQ!%@qZ23d(#Y&RjH5]jCk!u7w&u0udARjFd/prq=tyvpaEa(a:.!a1aZ(@@=I}:9wpd%=<sX55w_h}@@=I{t=ay<aU@@=I}T=ay<2@@=I})?C9:9au@9Cb]}DP~=x-fAZ(2Wl1=ay<aU@@=I}>5@d##Y+jTv|vV~EfFj]uNpn~FRfGdgaK!Z2&!a8a-Tb({E!acTbM*!a(DtY[yYd'%Y#sl[y*hHvh>Re5x2c{Z}.j4uCvcawRiMd+#X+_x&d!},<5RkX;2Hzw@x,gavfB-!{CcF&T#Roe;RodwWbBg5urRgaKvHC*_6Vz+<4opieuew&Rmq@d]&Y)X,T#X0Rh}<BqP=4qS9:ReMg/ujReNJw0!/<Jui%!bd{kawwnemRelAxUa?a3#*.&UX(Ya+a/RhvRnQ<o}9Wmtd-#Y&RgSRmw9;Rmxay=Rmyg-vaRmuxEhSrNu,v-voC!%(aR.a(a7+1Ro1>Ro5CE{A9b]{@;5x#eO{:g;urRi+KrNA!%(Ro3>Ro79;Ri_Ku@>{;&!x%gX|{KunA_+g5QRj/g3u5Rj#g>uERj%wio/xRhS&!,!#^1U}wba{8>>@=be}qC@:D5ba{7Ku+A&!}x?ba}t>>@=be}se(aA^^^Uat!b0#{pa+awUazbGa#aLb9bgaWac'a5TbS=Br!d1#`%scp_Jvl!#rT>Re0JvX&!VyN=H{Fcm#U&:pY=ReaJv2&!]h0=]nUJvG'!6Vy|=<r%JrM_=]h2@Wlud'#)U'Wf'b]{i=]h/Jvh!&~BpWg=v]RnMx+ny#'Nu;pVwjnu=]nwxJnx,T#`&Reqwjnt=]nvieu9vrRjLLuYwP(#+!th@wih5pX~Gr'g5v/Rh4KunA'!-CARnP@wwiN:Rm_9x'cvw>!|l=<saKvAA!0&3@q}>w^e1bp#&Re2Re3BDx7gH#T|f5H|eKuZ>!%(:qNAH{]Jv6!+3B2B9=b^{X<5<B92:E{ZLvhwA(a;a%!igQuyRmad+#Y}m@3Rh5d8#X'X*:AqUAHzmaxwbh<aXRnVcF}RT#Nw&cj#U(BWnug/vsRntdka)(a3+.Zb7aYYan1!bVa@Xa}[y^@b[{G=H{+hFu73Rj&Pv#5ReQcK%T#sig1v{Rj'Ku+D#'!t]~Grm~?rkKuMB!01d5#`'Vy.ta3Dtu~Hroc8#'{^45s85AwZbP&!#Rn!wghxWn#KvEA!)&2RlA2RlBx:h|#(T,=]j09Wobz>x]z/@awRoTd+#Y(az]hFhCrm4d,#Y+jTv|Q~EfMj]uNr|~FRfOdCa!Xa9_X#@<plJvf!%b`{(9;Rgwc;.!#2x7cw#T|UDb]|T5Ju={(!=@E{&Jv)&!Ab`{'awJvf!~*>>@=be{#KuY>!+&4Ezyi[ugv&RjIdea+T)#UXa&T-T&a!Rh9auRmW=]kLg5vuRn+g3u4Rn-Ow6ARn,hHus5xNk?#UX(U~)/g8v0RkD~AwkkF?Ri.OuNBwkkA?Ri/d|a2`a*^UYa.!aBTZaTa'Xa;!(!2!-a#b2[yC>6Vyq3[xr2Wi?g1rusVh%s?DtF~<5rbJs;%!DtBfswKtCj[uvuSsEu3RgVx3o:u+wN'*Zt;@3rd~Grh~?rfg8w)Lq)qE&-a%!>bI|`jWv0vV~EfCjTv|vV~Ef@j]uNpn~FRfBcK#T']gWNu7x,k7q4ai(0!hHv8<RhmkMu9vrsBuev/RhlCJvB!,g<v{wchh~@:Rhji[vrv{wchi~@:RhkdS&a5UY#Ta!RgPwwiI5BwciI~@:Rh`x'iJvj'!5]iJPu8Bwch]~@:Rhach)U#h3rp]gLh@t|Ax,hTq3ah!-(~@:Ro0Ou!5RhXj^v(pyw8unRhVd|)`,^UYas!a?/a2Z'a^Ta{Tb7Ta(a#!a,Wf&9sZ3DtAadamov=Bqt3[xig8vsRm~>waiL2b`{QJv*_Ouv2qgj<v]v2BqfdR'X*X#Y-@3qr~Gqv~?p6hHv-]glPup5Lq+q?_%*b_{qF{n9b^{rOu4ARhpKvCD!+&~Bqp:5Dbb}nwoiKl&unuTuBv]v+ueunaXRf0=Jvh!0nKufu8v1w&w7q%w&uHrz:Rgnj5w,uxDJq/(!hNw'5ReCk0s2u3w/w'5ReFd>Za&!*UaA=<wkgsRnSJv^!%Refifw3vyRgOKu_B'!,<]gkiiu:w&Rh<=C@a^<B57@2F{[<B5@aW:=3away9A5aW=<B=C@a^<B57@2F{Ie-#`(^^^bCara.b8aza6!/bZ,!adTbnTbOb+aFaS!aAT9@Wf~2Wli3Dtl2@d,#Y&RfnRfmJwJZtN~GqyJva&!VyMg<v~Rm%iXuJu3Rm9Jv[_=]ih9wlkDRkCd1#`(@Wg>2Wls3cH#T(@<Rj*=>Ri|b~'#23s9h<~El.d'#Y&Dtxi^rzvdRl#d*#U%(o|B2s`hJwSaxRmDKv4B&!1:Rmdd5#`'Vx}to~Hq{x'f1v3(!BA5ba|bJv_&!Wfug1v]ReIdO+U/Y#&G}-8wze=Rh{g1v]ReHg/uQRf/by#)ibQwERl/cH#T(@<Rj+=>Ri{cNu+vlax-!(#a0qa9<Rii2;;bU{H;x<i=&X#Rk`<4wwi=C9H~8xAI(Y#<azRi@45wXI<B9;5bb~7dL(X#Xa(+!aL6Vy{g5QqOau:5au2@ay547EzbxOcU(UX-T#Ta#:Cbb|A?wjh/b_|SOw6ARgtihr}u7Rhy<d1#T)X1@@=I|~=ay<2@@=aybb}Sj3vLv;<d,#Y(56H}A978H}@dGpvs@uAu`vcw9*!aFa+ai%(b!aXa8.a?a[ozWey=sU2@G}Nch&U#Rf_WexKu+D#'!t:~Gr`~?r^j]uNr|~FRg*j^psurwJt|RmcKv)@&!)7Rkv~Br[@wxfO:Rl3co#U'6Rezj_q#vIuavjRltwzeyh@vr5JqD0!>aY?C9:9au@9Cb]}9cl#U*5;5<H||jbuus1ucv&Rfvg1v~d/pppzqFr^a--a~!aMat1(hFv;Wiz@@=Izoj5uuv-7Rix~Cw`fk2WlVcZ#X,k)u3vWs@u2]ktg;wEx'fBq(_2Wg/jTv|vV~EfoJv]!15x'hzqG!(P~EfU~CRl_j6v(us5x4i-#T(2WmZ?C2F|d>Kq<aj1!*jTqIsBv=Wl`~Cw`fi2WlWj`v0u*~>RlR=c>Z,k#u3vWs@u2]kr<c1Z+jTqIsBv=Wla~Cw`fm2WlXdmb3!a{(arZa`bkTa%TbQTa-a9+c'!aM!/[yL=Bqug.w'RifhFvyDRj.g>vgwyk^9]k^Jv3_@WfbAARkhJw2_[x|JvB_wkoIRoKwkoJRoLd'(Y#<]gm=<9<H|yd'%_X#skDtb3awwqkgNulRkgdB#^',9:p'hJwSaxRmEBwVb8@4=H|qLu+w50&!)@3qs~?pU>Awwn;;Rn=c:Z'ARn<=<qwKvC@!/&~BqqJv6!&]eVb^z^xRge'/a%+^`#Sge}6<4Rn3=]n0Pw2>Rn8Jw0!&>Rn:>Rn6cY#a7+!a&=<wkaNw~h3z_c5Z{=wjh#=]nLKv^D!&)Vyz=bW|swYb<WetcG#T(2wxa@qVx@gD#Y&b^|V5JwG&!5bb|pg/w&RgD@x=kHs=uAvn!a%%/'+RmSRh694Ro`g-vaRmRhHv-]mlxCcS#`&ba~.5cD#Ta)P~=d,#Y(56H{>978H{Dd_#{2^Y%_+qbbb{6g3sERhsbU{?dfa.,`a(Xa<!aiX#(55RiG54RiHcI#T'WiU3RiVNvdwtfcRlKNvdd,#Y&RlHRlExQgf.1*^T'X#Sgf}6Wn4=]hfPrk>Rn7Jw0!&>Rn5>Rn9Lunw?&a2!,5<oq@@wqfdRlJj5Q~=d,#Y(~ARfcOuN]fdDKw;ay(}i!547E}j?cI#T(@5bV}iCbV}hdv(^^Tb?a40,b##Tbo!a*bR!a<b|a/!aKai!aU[yK=]o^g:v>ReGJwPZtK<7Rh+h<~El,Pv#5ReR@awwxjCg,ulRjDJv6&!]j!z?aQeeg>w=Sh<eeJw;!&axEzOg,Qosc!#*:wkeJ]eJ>x'h-u(!%Ro.w~h.zPdNZ(X,Ya![x{;9ReY;wkgxRiF:x?ap#Y&RmUg<s2Rkod]+UY0TZ'!a&A9sw<=bczLNvuw{gqzNhJwSaxRmCKuLay!#&s_Rf-55b^{uJvZa!!c%#(55Ri654wmiu5RiuawLu,vp!+}^%b_}Y9;wkgxba}o>A9:=b^}zKuh=a''!3awRk3c*'!#aHRk6c+Z&Rk5Rk4Jv)&!awRjSawd9*`#0?C2@EzMj8u<uJ5RmbjQrquJu3x,k>uq@_+=ayb^|W~ARkEOuN]k@7dhzV^X/X&a-#zRzSb`zXcJzTT#2WkVKvDBzW!%FzY9;5bbzWjQrquJu3Jw3%!b`zU=ayb^zQd:#X(T-a!6Vyywxh}=b]{Jg=u1RiAdGp~qHtzv!w(wA+a+a;<!aJaYai'anasb(=azRmV:Cbb{MLq2vb!%')RjuRjrRjtRjqx3jnqCw3!%')Rk(Rk+Rk&Rk)Lq2vb!%')Rj{RjxRjzRjwLq2vb!%')RjsRjpRjfRjex3jcqCw3!%')Rk'Rk*RjkRjl9<CbbzfOu4ARhxLq2vb!%')RjyRjvRjhRjgx=joq*uKvb!%')+-Rk.Rk%Rj~Rk-Rk#Rj}x=jdq*uKvb!%')+-Rk,Rk!Rj|RjmRjjRjidAq&qKs@uAv8Aa.'*-a@a&0!aM@a5[y73Dsy3Ds|3Dt):wxgI2sHJwJZt.~Gqxwsf0ikrzt}Rl0Jvy_[xj~HqzKv_A|D!&WfP8axRoVcf,U#k(v]v+ueunaXRf1Ju}'!g8u#Ri=jQw!sCunLprq>!,')~<5qeGzq9F{W=c##%s5au:5aU3CBE|;d4#X(D!a&6Vygx(b;#(=]ed?C2F{N<capoq2r[a&!aPa9,'Pw;5s:@@=I|,55w_h|@@=IzcP~=x'fCqB_2Wl2>aU@@=I|1OuNBc1Z+jTqIsBv=Wlc~Cw`fl2WlZ~AcTa%!Z+jTqIsBv=Wlb~Cw`fh2WlYk+uNqJsBv=WlSg,u3dca3#UXaMYa)TaB-=cM|7T#<bI}l5@B932:aV2G{BOuNBJq:|M!5Ezt=<B=C@a^<B57@2F{v>cB{/T#=ay<bI{3Jv6!a.6BKq0ah&+!5E}HP~Ef{978BaU@@=Iza<7d#.Y#978BaU@@=IzH~AJq0!(@@=IzG978BaU@@=IzFe,aU*Y&^^^bvJb,b:bFad!a,c2Ta>aL.bo6!a#CbTa'T#Re{2Wlh2@G{yg6t~Ro_NvdRfticuRQRllJv3&!x&c|zs@Jw3!%RflwpfkRlpKuL;%(!Re<@G|C2GzdhIvuBwgjAg-u0RjAKQB%!(GzZ@G|5NuuRl7d='T+Y#Vy[g<v~Rm!==G|>JvA!)@wma=]m1ifuaw&RmnLs@vT'!|/+[y,g:v>ReTJw1!#qX=x!eC{bLu+wT&)ZtZauq_~Graci&U#F|89:r_Lupvq!.)&2RlG8RfaC=x!eF{_h?rpWlmd&'!#X|&]k::xJey#`'T|+<E|&2@H|%dE#(^,g;u.RiEg6vjRiC9xCkA{O|zY#g=ucRmXKs0@!&*@G|m@awRknJuh!,3d(}gY}eJvj!%Rm):Jw3!%Rm+Rm-Ls0w(&!a(a#@b[|6cZ#X'7RkxWgAOu4ARn'dH'U#Y*Vz-Wm'CARm}d]*#a%^a*T'aK!a<9bV{PC=p*Jw4!&SgxcbB5r]idw(wBRmF7xFkt#&`(Rm/Rm8E|!JuY_9:Rl5=wrgr2:bbxd@xXfB(a*#T+!.X0X1Ta/a'T&RlDRfL>RlyARl9b[z[>RfZ:RlL:RfRwlg/ARl;9;RlxKv,A/!%7s69<74=BA5ba{-8Bde#`a<XaKYa1,a'P~=wxfB2bZ}}?C972@@=I}r8@55B9;5bb}G978B2@@=aybb}3j3vLv;<Jw3&!>Rfk=ayb^}4~Ad1#`*@@=aybb{w2@>==<bbz]dx+UY#^UaF!a9!bB'Ya1.!ajXa#%olRhD[y=3Dt#Ov5BrHKuMB%!(Rf^Wep~HrJwkiQjKr|~FRg)Ku+D#'!t5~GrF~?rDdV)UY,Z/_7RkuG{<~BrBg,rlsO:235B@bX}|d?a1!#`(6Vyn5@d##Y+jTv|vV~EfIj]uNpn~FRfH7Lq2vb1!a9-978BaU@@=Iz9978BbU}#~AJq0!(@@=Iz8978BaU@@=Iz7~AJQ|}!978BbU}!JvkaK!AdUa21-U#`a+(g/vsRn~Ou!5RPj:rmu9WhOjXuvvNr}:RhAj^v(pyw8unRn[kPr}p|u7vwv]RiSBd;pppzq@qHQa?(b.!a.a`@.|xa(hFv;Wiyj5uuv-7Riw~Cw`fg2WlU978BbU|wOuNBJqG!(P~EfD~CRlQcZ#X,k)u3vWs@u2]ksg;wEx'f@q1_2Wg.j]uNpn~FRfqJv]!15x'h{qG!(@@=IzK~CRl^j6v(us5x4i,#T(2WmY?C2F{1>Kq<aj1!*jTqIsBv=Wld~Cw`fj2Wl[j`v0u*~>RlT=c>Z,k#u3vWs@u2]kq<c1Z+jTqIsBv=Wle~Cw`fn2Wl]dn1#c(a(b^a2!b/bAT(bj!aDa7bu,a_a{c0!2T0g:v>ReD2@G{42@G{5~DpM~<5rc=Bx6i>{RT#RnI@zCx]y]z:2Jv[!zr5Awyk]9]k]dD(Y+X#6Vz.g=wKtgwhaCwgmTWj2Lu,w%_+/[y-B;b^xeg3u3Rj-2@bX{*KrJ<!+'@Wg(g?QRlC@Jv`!%b[zIwsfII}8JQ_@w|kW|=Jv(%!AqcOuNBJvEzh!bYzjLs@wP#(0!oy@>RkdJwMZtc3Dtd@BcG#T'9bWxg2@2Fznd*#Y+;2x'c}w<zizixNgwa#Z'U+!/!a'!a+w~g~z6wcn{Rn}wcnzRn|5Rh%=]nJg5vuRmvNvdRlvcprJu}w*az*a#!%.a.'Bot9qT]kj@Wg'ay2Gzv@Jv`!%b[zEwsfHI}1;ck#Ux`<Cbbx_Lu+w!a&0*!wko*wwo,So,}6Juqxf!E}PigQuyRm`d3(`#8>Rn%:A5B;bZ~%KvhCa!a2!x>k7#Uxb@b{#xaRk7Jw0!)>wwhlShl}6>wwhmShm}6CJvB!.x'hhvj{!!5Bwkhhbaz}x'hivjz~!5Bwkhibaz|xEhTrNu,v-vpD!a%&/)a3a.,%Ro2t[CE{)@3re9b]{%wjo09:rgc:Z&Ro6=<riifuaw&RmoKrNA!%(Ro4>Ro89;Ri`dSaL'UYzxZb)7Rka3xRhT&!,!#^1U}vbaz{>>@=be}yC@:D5bazzKu+A&!}{?ba}y>>@=be}wxBh[t`u~vJvr!%a!a()a,a0a4RoC=]o;Ju(!%RoGRhdwjh`=]oAg>w#Ro?g5vuRo=NvdRl|Ku]C.!&;RoEJvB!%RoORoMBx'h[v+_?w~h`}~5?w~hd~!xKh]oiptu-utv.vp!#%&a30a@a'a+(a/aOp(o~p!RoDJu(!%RoHRhewjha=]oBNvdRl}g>w#Ro@g5vuRo>c[#X']o<CauRoRAd-#Y':RkpauRoQKu]C.!&;RoFJvB!%RoNRoPBx'h]v+_?w~ha}t5?w~he}ue!/UbhYacXaW^Tc&a;b:a-c/#b&aja1(!cL+!bKbt!bmcRc9aIc?8[yW3Dtt94Rg`Jv}!&SiRMzBhEebShEMNuPRe>x7gL#TzuwjirRipc<Z&>on;>z=h-MSh.Mwqczx'a7vj&!>Re4@=ResJt__NuPRi*NuPRi)j]uNr|~FRfzKrJ>_+@Wfy@Wf]2WocKrJ<!+'@Wg%g/QRl@@Jv`!&awRl<wsfFIzgLu(w*!.*&ShBMwvhIRhI9;RhNx1hK'!#Sn]Mx1hK~0!#:2<H~7cNu+w7D*'1ZtW>Rn1~?rOc:Z&Rn2=<rQ<7wjh&=BSnLMc]#X(6Vz)w[b=a!U#9wzgMc3#&(RgMRitRis<x,gKt`ax!&+SioM=BSilMc3#&(RgKRinRimKurB,!&SiQMzBhDebShDM6BJQ!(P~Efx978B2@@=I}WLrJw!!,a*&@G}O@9wkibRid@@x'fKwC!&SlDMSfLMjUv~Q~EfKKv3@a+!(hFv-]mpx/hYZ(C5RiWz<o/MwkhY?So/M@x,gbvfB*&!SgEM:SoeeehFu3:Rgbda(,^TZa)X/7Sg[eb:2RgI~BrMC@wgkc:wwkcRerx3h(uUvK!&*,SnOM4Sh*MArRg;wHRh(x=h;rJvPwI!a4',a'0@Wg&=BSh/Mg>w=Rh=g3w*wwgGRgGcW(X#;Sg}M2Gzk@Jv`!&awRl=wsfGIz`dKZ*T'Y-:RhR7RhQg5u-p`j6v(us5d,#Y+~Awkia?RicOuNBwkibba}Ld6p~tyu_vbAa'a+!a/'a3aEa8a!>Sh,ebJv{!&Sh@ebSaReb9;SgwebNuPRi(NvdRl)NuPRi'hHu^<Rm^Jvv_@Wl(g;u1Si/ebKu'B&!*Sh?eb@Wl'z@aPeb95Si.ebcpputyvjB)!,&a+0a%ShAMWeK@G}C@WfJ9;RhMwvhH9w{ia}ix,hJvRA1(!zAn[MRhHx1hJ~*!#hFv(BSn[MBJQ!(@@=I~'978B2@@=I}2db.Ua<'X}+T#a0XaG2G}E;wkg|wuh!Rh!x,hZu,@)!&So0MVy)C5RiXACJvB!&5RiY5RiZg8w)cG}*T#2@bU}=KsA>(!a.3wkhZba~(x,h^u(A!&(SoCMRhb5Bz=h[eb?w~hb~6x,h_u(A!&(SoDMRhc5Bz=h]eb?w~hc~6e)aA1T#T,^^^c-bMb&blcPaP(a/!0!bA=b5c@a(!bfbrc#2afwmhARnjwchORnp2Wlf3DtsNvdRl-2@wpa<]m0bx(#:awRk2@Jw3!%RfhwpfgRlnKQB%!(G{V@G|'NuuRl6d='T+Y#VyUg<v~Rl~==G|<Jv+'!aYShC}6@B<5?ba~8@Jw3'!g2QRljhLrpWlOd+#Y'g.w'rIg>w*wgj@g-u0Rj@Lu+wT&)ZtUauq]~GrGci&U#F|39:rELrNvj!.%*RhCwunfw~nf~:9;Ri]>wtnhg;wHRnhx3hDs@v~!/+'@Wfr@9RkSNu&Rlo=@<5GzoKs0@_+@Wl+@awRkmJuh!-3d(}pY#qWJvj!%Rm(:Jw3!%Rm,Rm*de&!1U-U#`)Re;@G|.@9Ri82@wjfvRlq=@<5GzpLvOvr!).&2RlF8Rf`C=x!eE{.Jw3_g2QRlkhLrpWlPde(!#U{s,UXa*Ta'[y'g:v>ReS;x0PZ&RnlRnn~HrKJw1}f!=x!eB|2w]aP(#Xa&a*Ta.Ua2a7=]iOd'#Y&Ro&WnWg;u.RiDg6vjRiBNvdRlzhNvj]nYJuW_2Wm3x)kFze{9d])!a.!,Y01!#&aC!a3RndC=ox~BrC@2b^{pg,rlse7x'ksuq!%Rm.E{xidw(wBRmGx9o+)X#wwo-So-}69:Rl4@xSf@a#XZ'X)X,Ta(/ARl8b[xc>RfY:RlI:RfQwlg.ARl:9;Rlwdn'#^XafaQa1X1TaHTa)@b[{zcZ#X'7RkwWg@Ou4ARn&x)kG#{,g7u/RkGdH'U#Y*Vz'Wm&CARm|bx#(A]gUbUzJj9Q~=d,#Y(56H}l978H{U7d,0#U*2>ABb_xZ978BbU{e~AJQ{g!978BbU{hxMh?ad{oUYZ.x1h?{l!#:2<H{mx3n[t{vl!,&a%3Ro(z=iS}6ARnr=Bwsn^wvn`Rnbd`*T}B0!#^X'BG{c9b]{a>>@=be}F?JvS!&BG{d7BG}(Bde#`a1X,Ya@!a'P~=wxf@2bZ}I56B2@@=aybb}08@55B9;5bb}<j3vLv;<Jw3&!>Rfg=ayb^}&OuNBKuLA!)a!P~=x#fD{f2@>==<bbzl?C972@@=Ix^d6rSu,v7w*C(0a)a6#B+a%!sQ[y?3Dt%3[xn~<5rLOu!5p@Ku+D#'!t7~GrP~?rNKvlaya7'!h+v-5qMg=t|cd,U#5AAaa5Abb{S@52B5@a[@52B5Gx[iXueu;d<#`a(!/549C;ag>23ExY5@Dah89b^~689Jv)!~2b[~1Lv'w(%*!a#bX|aPrmawRe]keu7uhv-q6rxu,q`xTo]/a5aU!bNaDXbi!b-!ao!b<bwA!#5@B932:aV2G|:d-)Y#hJrL>RhG<7@C5<H|_=Cau:5aj5@B932:bJ|ng>vIbs)#?C2F|9jPv0w.vISh-MKvUaz(.!9ABbb|[5;5<H|Eg>unwfh;9:4E|YjQsBt|vjx'hYq3!(?C2F|J:2<BaY?C2F|GOu!5x,g|p{ah!-(?C2F|c9:4E|OjXuvvNr}:Rh&i[w*t|cd+U#jJvsu)vsSn~Mkfrmu9p}u7vwv]So!McW#Xa!ax5@A5aY:5;5<H|>kJv~vYrquJu3x4ib#T)2@SmZM?C2F|Bj:rmu9@xPhI(a*a#U#`a3-5Abb|L~@:RhK9:4E|0@52B5G|#C::aY?C2F|-:2<BaY?C2F|.5Jvk!a)javYrquJu3x4ia#T)2@SmYM?C2F|HAxPhH(!a#U#`a*-5Abb|4~@:RhJ9:4E|R@52B5G|F:2<BaY?C2F|Sc^#Xa2j=Qq5CJvB!-g<v{z;hhM?C2F|Zi[vrv{z;hiM?C2F|XKsA>!a)-g<v{z;h[eb?C2F|]i[vrv{z;h]eb?C2F|^iZu.vix,hZq3ah!.(?C2F|QOu!5ShXM:2<BaY?C2F|P", 13494, 2713, 49, 25, 61), T;
(function(e) {
	e[e.VALUE_LENGTH = 49152] = "VALUE_LENGTH", e[e.FLAG13 = 8192] = "FLAG13", e[e.BRANCH_LENGTH = 8064] = "BRANCH_LENGTH", e[e.JUMP_TABLE = 127] = "JUMP_TABLE", e[e.VALUE_MASK = 8191] = "VALUE_MASK";
})(T ||= {});
var E;
(function(e) {
	e[e.AMP = 38] = "AMP", e[e.NUM = 35] = "NUM", e[e.SEMI = 59] = "SEMI", e[e.EQUALS = 61] = "EQUALS", e[e.ZERO = 48] = "ZERO", e[e.NINE = 57] = "NINE", e[e.LOWER_A = 97] = "LOWER_A", e[e.LOWER_X = 120] = "LOWER_X";
})(E ||= {});
var oe = 32, se = 21, ce = 2097151, le = 2047, ue = 0;
function de(e) {
	let t = e >>> se;
	return t === le ? ue : t;
}
function fe(e) {
	return e - E.ZERO >>> 0 <= 9;
}
function pe(e) {
	return (e | oe) - E.LOWER_A >>> 0 <= 5;
}
function me(e) {
	return (e | oe) - E.LOWER_A >>> 0 <= 25;
}
function he(e) {
	return e === E.EQUALS || me(e) || fe(e);
}
var ge;
(function(e) {
	e[e.EntityStart = 0] = "EntityStart", e[e.NumericStart = 1] = "NumericStart", e[e.NumericDecimal = 2] = "NumericDecimal", e[e.NumericHex = 3] = "NumericHex", e[e.NamedEntity = 4] = "NamedEntity";
})(ge ||= {});
var _e;
(function(e) {
	e[e.Legacy = 0] = "Legacy", e[e.Strict = 1] = "Strict", e[e.Attribute = 2] = "Attribute";
})(_e ||= {});
function ve(e, t, n, r) {
	let i = (t & T.BRANCH_LENGTH) >> 7, a = t & T.JUMP_TABLE;
	if (a) {
		if (i === 0) return r === a ? n : -1;
		let t = r - a;
		if (t >>> 0 >= i) return -1;
		let o = e[n + t];
		return o === 0 ? -1 : n + i + o - 1 & 65535;
	}
	if (i === 0) return -1;
	let o = i + 1 >> 1, s = n + o + i;
	for (let t = 0; t < i; t++) {
		let i = e[n + (t >> 1)] >> ((t & 1) << 3) & 255;
		if (i === r) return s + e[n + o + t] & 65535;
		if (i > r) return -1;
	}
	return -1;
}
function ye(e, t, n) {
	return n === 1 ? String.fromCharCode(e[t] & T.VALUE_MASK) : n === 2 ? String.fromCharCode(e[t + 1]) : String.fromCharCode(e[t + 1], e[t + 2]);
}
function be(e, t, n) {
	let r = t + 1, i = 0, a = r;
	if (r < n && (e.charCodeAt(r) | oe) === E.LOWER_X) for (r += 1, a = r; r < n;) {
		let t = e.charCodeAt(r);
		if (fe(t)) i = i * 16 + (t - E.ZERO);
		else if (pe(t)) i = i * 16 + ((t | oe) - E.LOWER_A + 10);
		else break;
		r += 1;
	}
	else for (; r < n;) {
		let t = e.charCodeAt(r) - E.ZERO;
		if (t >>> 0 > 9) break;
		i = i * 10 + t, r += 1;
	}
	if (r === a) return 0;
	r < n && e.charCodeAt(r) === E.SEMI && (r += 1), i > 1114111 && (i = 1114112);
	let o = r - t;
	return o >= le && (ue = o, o = le), o << se | i;
}
function xe(e, t, n) {
	let r = ae, i = e.indexOf("&");
	if (i < 0) return e;
	let a = e.length, o = 0, s = "", c = r[0], l = c & T.JUMP_TABLE, u = (c & T.BRANCH_LENGTH) >> 7;
	do {
		let c = i + 1, d = e.charCodeAt(c), f, p;
		if (d === E.NUM) {
			let n = be(e, c, a);
			f = de(n), t && f > 0 && e.charCodeAt(c + f - 1) !== E.SEMI && (f = 0), p = f === 0 ? "" : re(n & ce);
		} else if (me(d)) {
			f = 0, p = "";
			let n = d - l, i;
			if (n >>> 0 < u) {
				let e = r[1 + n];
				i = e === 0 ? -1 : u + e & 65535;
			} else i = -1;
			let o = 0, s = 0, m = i < 0 ? 0 : r[i], h = c + 1;
			trie: for (; h < a;) {
				for (; (m & (T.VALUE_LENGTH | T.FLAG13)) === 0 && (m & T.JUMP_TABLE) !== 0;) {
					let t = m & T.JUMP_TABLE, n = (m & T.BRANCH_LENGTH) >> 7;
					if (n === 0) {
						if (e.charCodeAt(h) !== t) break trie;
						i += 1;
					} else {
						let a = e.charCodeAt(h) - t;
						if (a >>> 0 >= n) break trie;
						let o = r[i + 1 + a];
						if (o === 0) break trie;
						i = i + n + o & 65535;
					}
					if (m = r[i], h += 1, h >= a) break trie;
				}
				if ((m & (T.VALUE_LENGTH | T.FLAG13)) === T.FLAG13) {
					let t = (m & T.BRANCH_LENGTH) >> 7;
					if (e.charCodeAt(h) !== (m & T.JUMP_TABLE)) break;
					h += 1;
					let n = t - 1, a = i + 1, o = 0;
					for (; o + 1 < n; o += 2) {
						let t = r[a];
						if (e.charCodeAt(h) !== (t & 255) || (h += 1, e.charCodeAt(h) !== (t >> 8 & 255))) break trie;
						h += 1, a += 1;
					}
					if (o < n) {
						if (e.charCodeAt(h) !== (r[a] & 255)) break;
						h += 1;
					}
					i += 1 + (t >> 1), m = r[i];
					continue;
				}
				let n = m >>> 14, l = e.charCodeAt(h);
				if (n !== 0) {
					if (l === E.SEMI) {
						f = h - c + 1, p = n === 1 ? String.fromCharCode(m & T.VALUE_MASK) : ye(r, i, n);
						break;
					}
					if (!t && (m & T.FLAG13) === 0 && (f = h - c, o = i, s = n), n === 1) break;
				}
				let u = ve(r, m, i + (n || 1), l);
				if (u < 0) break;
				i = u, m = r[i], h += 1;
			}
			if (p === "") {
				let e = m >>> 14;
				e !== 0 && !t && (m & T.FLAG13) === 0 && (f = h - c, o = i, s = e), f > 0 && (p = ye(r, o, s));
			}
		} else f = 0, p = "";
		f === 0 || n && d !== E.NUM && e.charCodeAt(c + f - 1) !== E.SEMI && c + f < a && he(e.charCodeAt(c + f)) ? i = c : (o < i && (s += e.slice(o, i)), s += p, i = o = c + f), e.charCodeAt(i) !== E.AMP && (i = e.indexOf("&", i));
	} while (i >= 0);
	return s + e.slice(o);
}
function Se(e, t = _e.Legacy) {
	return xe(e, t === _e.Strict, t === _e.Attribute);
}
var D = Symbol("NOT_RESOLVED");
function O(e, t) {
	return {
		tagName: e,
		nodeKind: "scalar",
		implicit: t.implicit ?? !1,
		matchByTagPrefix: t.matchByTagPrefix ?? !1,
		implicitFirstChars: t.implicitFirstChars ?? null,
		resolve: t.resolve,
		identify: t.identify,
		represent: t.represent ?? ((e) => String(e)),
		representTagName: t.representTagName ?? (() => e)
	};
}
function Ce(e, t) {
	let n = t.finalize === void 0;
	return {
		tagName: e,
		nodeKind: "sequence",
		implicit: !1,
		matchByTagPrefix: t.matchByTagPrefix ?? !1,
		create: t.create,
		addItem: t.addItem,
		finalize: t.finalize ?? ((e) => e),
		carrierIsResult: n,
		identify: t.identify,
		represent: t.represent ?? ((e) => e),
		representTagName: t.representTagName ?? (() => e)
	};
}
function we(e, t) {
	let n = t.finalize === void 0;
	return {
		tagName: e,
		nodeKind: "mapping",
		implicit: !1,
		matchByTagPrefix: t.matchByTagPrefix ?? !1,
		create: t.create,
		addPair: t.addPair,
		has: t.has,
		keys: t.keys,
		get: t.get,
		finalize: t.finalize ?? ((e) => e),
		carrierIsResult: n,
		identify: t.identify,
		represent: t.represent ?? ((e) => e),
		representTagName: t.representTagName ?? (() => e)
	};
}
var Te = O("tag:yaml.org,2002:str", {
	resolve: (e) => e,
	identify: (e) => typeof e == "string"
}), Ee = [
	"",
	"~",
	"null",
	"Null",
	"NULL"
], De = O("tag:yaml.org,2002:null", {
	implicit: !0,
	implicitFirstChars: [
		"",
		"~",
		"n",
		"N"
	],
	resolve: (e) => Ee.indexOf(e) === -1 ? D : null,
	identify: (e) => e === null,
	represent: () => "null"
}), Oe = O("tag:yaml.org,2002:null", {
	implicit: !0,
	implicitFirstChars: ["n"],
	resolve: (e, t) => e === "null" || t && e === "" ? null : D,
	identify: (e) => e === null,
	represent: () => "null"
}), ke = [
	"",
	"~",
	"null",
	"Null",
	"NULL"
], Ae = O("tag:yaml.org,2002:null", {
	implicit: !0,
	implicitFirstChars: [
		"",
		"~",
		"n",
		"N"
	],
	resolve: (e) => ke.indexOf(e) === -1 ? D : null,
	identify: (e) => e === null,
	represent: () => "null"
}), je = [
	"true",
	"True",
	"TRUE"
], Me = [
	"false",
	"False",
	"FALSE"
], Ne = O("tag:yaml.org,2002:bool", {
	implicit: !0,
	implicitFirstChars: [
		"t",
		"T",
		"f",
		"F"
	],
	resolve: (e) => je.indexOf(e) !== -1 || Me.indexOf(e) === -1 && D,
	identify: (e) => Object.prototype.toString.call(e) === "[object Boolean]",
	represent: (e) => e ? "true" : "false"
}), Pe = ["true"], Fe = ["false"], Ie = O("tag:yaml.org,2002:bool", {
	implicit: !0,
	implicitFirstChars: ["t", "f"],
	resolve: (e) => Pe.indexOf(e) !== -1 || Fe.indexOf(e) === -1 && D,
	identify: (e) => Object.prototype.toString.call(e) === "[object Boolean]",
	represent: (e) => e ? "true" : "false"
}), Le = [
	"true",
	"True",
	"TRUE",
	"y",
	"Y",
	"yes",
	"Yes",
	"YES",
	"on",
	"On",
	"ON"
], Re = [
	"false",
	"False",
	"FALSE",
	"n",
	"N",
	"no",
	"No",
	"NO",
	"off",
	"Off",
	"OFF"
], ze = O("tag:yaml.org,2002:bool", {
	implicit: !0,
	implicitFirstChars: [
		"y",
		"Y",
		"n",
		"N",
		"t",
		"T",
		"f",
		"F",
		"o",
		"O"
	],
	resolve: (e) => Le.indexOf(e) !== -1 || Re.indexOf(e) === -1 && D,
	identify: (e) => Object.prototype.toString.call(e) === "[object Boolean]",
	represent: (e) => e ? "true" : "false"
}), Be = /* @__PURE__ */ RegExp("^(?:0o[0-7]+|0x[0-9a-fA-F]+|[-+]?[0-9]+)$"), Ve = /* @__PURE__ */ RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
function He(e) {
	let t = e, n = 1;
	return (t[0] === "-" || t[0] === "+") && (t[0] === "-" && (n = -1), t = t.slice(1)), t.startsWith("0b") ? n * parseInt(t.slice(2), 2) : t.startsWith("0o") ? n * parseInt(t.slice(2), 8) : t.startsWith("0x") ? n * parseInt(t.slice(2), 16) : n * parseInt(t, 10);
}
function Ue(e, t) {
	if (t) {
		if (!Ve.test(e)) return D;
	} else if (!Be.test(e)) return D;
	let n = He(e);
	return Number.isFinite(n) ? n : D;
}
var We = O("tag:yaml.org,2002:int", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		..."0123456789"
	],
	resolve: Ue,
	identify: (e) => Number.isInteger(e) && !Object.is(e, -0) && e.toString(10).indexOf("e") < 0,
	represent: (e) => e.toString(10)
}), Ge = /* @__PURE__ */ RegExp("^-?(?:0|[1-9][0-9]*)$"), Ke = /* @__PURE__ */ RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
function qe(e) {
	let t = e, n = 1;
	return (t[0] === "-" || t[0] === "+") && (t[0] === "-" && (n = -1), t = t.slice(1)), t.startsWith("0b") ? n * parseInt(t.slice(2), 2) : t.startsWith("0o") ? n * parseInt(t.slice(2), 8) : t.startsWith("0x") ? n * parseInt(t.slice(2), 16) : n * parseInt(t, 10);
}
function Je(e, t) {
	if (t) {
		if (!Ke.test(e)) return D;
	} else if (!Ge.test(e)) return D;
	let n = qe(e);
	return Number.isFinite(n) ? n : D;
}
var Ye = O("tag:yaml.org,2002:int", {
	implicit: !0,
	implicitFirstChars: ["-", ..."0123456789"],
	resolve: Je,
	identify: (e) => Number.isInteger(e) && !Object.is(e, -0) && e.toString(10).indexOf("e") < 0,
	represent: (e) => e.toString(10)
}), Xe = /* @__PURE__ */ RegExp("^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?0x[0-9a-fA-F_]+|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+|[-+]?(?:0|[1-9][0-9_]*))$");
function Ze(e) {
	let t = e.replace(/_/g, ""), n = 1;
	if ((t[0] === "-" || t[0] === "+") && (t[0] === "-" && (n = -1), t = t.slice(1)), t.startsWith("0b")) return n * parseInt(t.slice(2), 2);
	if (t.startsWith("0x")) return n * parseInt(t.slice(2), 16);
	if (t.includes(":")) {
		let e = 0;
		for (let n of t.split(":")) e = e * 60 + Number(n);
		return n * e;
	}
	return t !== "0" && t[0] === "0" ? n * parseInt(t, 8) : n * parseInt(t, 10);
}
function Qe(e) {
	if (!Xe.test(e)) return D;
	let t = Ze(e);
	return Number.isFinite(t) ? t : D;
}
var $e = O("tag:yaml.org,2002:int", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		..."0123456789"
	],
	resolve: Qe,
	identify: (e) => Number.isInteger(e) && !Object.is(e, -0) && e.toString(10).indexOf("e") < 0,
	represent: (e) => e.toString(10)
}), et = /* @__PURE__ */ RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"), tt = /* @__PURE__ */ RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function nt(e) {
	if (!et.test(e)) return D;
	let t = e.toLowerCase(), n = t[0] === "-" ? -1 : 1;
	if ("+-".includes(t[0]) && (t = t.slice(1)), t === ".inf") return n === 1 ? Infinity : -Infinity;
	if (t === ".nan") return NaN;
	let r = n * parseFloat(t);
	return Number.isFinite(r) || tt.test(e) ? r : D;
}
function rt(e) {
	if (isNaN(e)) return ".nan";
	if (e === Infinity) return ".inf";
	if (e === -Infinity) return "-.inf";
	if (Object.is(e, -0)) return "-0.0";
	let t = e.toString(10);
	return /^[-+]?[0-9]+e/.test(t) ? t.replace("e", ".e") : t;
}
var it = O("tag:yaml.org,2002:float", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		".",
		..."0123456789"
	],
	resolve: nt,
	identify: (e) => typeof e == "number" && (!Number.isInteger(e) || Object.is(e, -0) || e.toString(10).indexOf("e") >= 0),
	represent: rt
}), at = /* @__PURE__ */ RegExp("^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$"), ot = /* @__PURE__ */ RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function st(e, t) {
	if (t) {
		if (!ot.test(e)) return D;
		let t = e.toLowerCase(), n = t[0] === "-" ? -1 : 1;
		if ("+-".includes(t[0]) && (t = t.slice(1)), t === ".inf") return n === 1 ? Infinity : -Infinity;
		if (t === ".nan") return NaN;
		let r = n * parseFloat(t);
		return Number.isFinite(r) ? r : D;
	}
	if (!at.test(e)) return D;
	let n = Number(e);
	return Number.isFinite(n) ? n : D;
}
function ct(e) {
	if (isNaN(e)) return ".nan";
	if (e === Infinity) return ".inf";
	if (e === -Infinity) return "-.inf";
	if (Object.is(e, -0)) return "-0.0";
	let t = e.toString(10);
	return /^[-+]?[0-9]+e/.test(t) ? t.replace("e", ".e") : t;
}
var lt = O("tag:yaml.org,2002:float", {
	implicit: !0,
	implicitFirstChars: ["-", ..."0123456789"],
	resolve: st,
	identify: (e) => typeof e == "number" && (!Number.isInteger(e) || Object.is(e, -0) || e.toString(10).indexOf("e") >= 0),
	represent: ct
}), ut = /* @__PURE__ */ RegExp("^(?:[-+]?(?:(?:[0-9][0-9_]*)?\\.[0-9_]*)(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"), dt = /* @__PURE__ */ RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function ft(e) {
	if (!ut.test(e)) return D;
	let t = e.toLowerCase().replace(/_/g, ""), n = t[0] === "-" ? -1 : 1;
	if ("+-".includes(t[0]) && (t = t.slice(1)), t === ".inf") return n === 1 ? Infinity : -Infinity;
	if (t === ".nan") return NaN;
	let r = 0;
	if (t.includes(":")) {
		for (let e of t.split(":")) r = r * 60 + Number(e);
		r *= n;
	} else r = n * parseFloat(t);
	return Number.isFinite(r) || dt.test(e) ? r : D;
}
function pt(e) {
	if (isNaN(e)) return ".nan";
	if (e === Infinity) return ".inf";
	if (e === -Infinity) return "-.inf";
	if (Object.is(e, -0)) return "-0.0";
	let t = e.toString(10);
	return /^[-+]?[0-9]+e/.test(t) ? t.replace("e", ".e") : t;
}
var mt = O("tag:yaml.org,2002:float", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		".",
		..."0123456789"
	],
	resolve: ft,
	identify: (e) => typeof e == "number" && (!Number.isInteger(e) || Object.is(e, -0) || e.toString(10).indexOf("e") >= 0),
	represent: pt
}), ht = O("tag:yaml.org,2002:merge", {
	implicit: !0,
	implicitFirstChars: ["<"],
	resolve: (e, t) => e === "<<" || t && e === "" ? "<<" : D,
	identify: () => !1
}), gt = /^[A-Za-z0-9+/]*={0,2}$/;
function _t(e) {
	let t = e.replace(/\s/g, "");
	if (t.length % 4 != 0 || !gt.test(t)) return D;
	let n = atob(t), r = new Uint8Array(n.length);
	for (let e = 0; e < n.length; e++) r[e] = n.charCodeAt(e);
	return r;
}
function vt(e) {
	let t = "";
	for (let n = 0; n < e.length; n++) t += String.fromCharCode(e[n]);
	return btoa(t);
}
var yt = O("tag:yaml.org,2002:binary", {
	resolve: _t,
	identify: (e) => Object.prototype.toString.call(e) === "[object Uint8Array]",
	represent: vt
}), bt = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"), xt = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
function St(e, t, n, r = 0, i = 0, a = 0, o = 0) {
	let s = new Date(Date.UTC(e, t, n, r, i, a, o));
	return s.setUTCFullYear(e, t, n), s;
}
function Ct(e) {
	let t = bt.exec(e);
	if (t === null && (t = xt.exec(e)), t === null) return D;
	let n = +t[1], r = t[2] - 1, i = +t[3];
	if (!t[4]) {
		let e = St(n, r, i);
		return e.getUTCFullYear() !== n || e.getUTCMonth() !== r || e.getUTCDate() !== i ? D : e;
	}
	let a = +t[4], o = +t[5], s = +t[6], c = 0;
	if (a > 23 || o > 59 || s > 59) return D;
	if (t[7]) {
		let e = t[7].slice(0, 3);
		for (; e.length < 3;) e += "0";
		c = +e;
	}
	let l = St(n, r, i, a, o, s, c);
	if (l.getUTCFullYear() !== n || l.getUTCMonth() !== r || l.getUTCDate() !== i) return D;
	if (t[9]) {
		let e = +t[10], n = +(t[11] || 0);
		if (e > 23 || n > 59) return D;
		let r = (e * 60 + n) * 6e4;
		l.setTime(l.getTime() - (t[9] === "-" ? -r : r));
	}
	return l;
}
var wt = O("tag:yaml.org,2002:timestamp", {
	implicit: !0,
	implicitFirstChars: [..."0123456789"],
	resolve: Ct,
	identify: (e) => e instanceof Date,
	represent: (e) => e.toISOString()
}), Tt = Ce("tag:yaml.org,2002:seq", {
	create: () => [],
	addItem: (e, t) => {
		e.push(t);
	},
	identify: Array.isArray
});
function Et(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === null || t === Object.prototype;
}
function Dt(e, t) {
	let n = {};
	for (let r of t) e[r] !== void 0 && (n[r] = e[r]);
	return n;
}
var Ot = Ce("tag:yaml.org,2002:omap", {
	create: () => ({
		list: [],
		seen: /* @__PURE__ */ new Set()
	}),
	addItem: (e, t) => {
		let n;
		if (t instanceof Map) {
			if (t.size !== 1) return "cannot resolve an ordered map item";
			n = t.keys().next().value;
		} else if (Et(t)) {
			let e = Object.keys(t);
			if (e.length !== 1) return "cannot resolve an ordered map item";
			n = e[0];
		} else return "cannot resolve an ordered map item";
		return e.seen.has(n) ? "duplicate key in ordered map" : (e.seen.add(n), e.list.push(t), "");
	},
	finalize: (e) => e.list,
	identify: () => !1
}), kt = Ce("tag:yaml.org,2002:pairs", {
	create: () => [],
	addItem: (e, t) => {
		if (t instanceof Map) return t.size === 1 ? (e.push(t.entries().next().value), "") : "cannot resolve a pairs item";
		if (Object.prototype.toString.call(t) !== "[object Object]") return "cannot resolve a pairs item";
		let n = t, r = Object.keys(n);
		return r.length === 1 ? (e.push([r[0], n[r[0]]]), "") : "cannot resolve a pairs item";
	},
	identify: () => !1
}), At = we("tag:yaml.org,2002:map", {
	create: () => ({}),
	identify: Et,
	represent: (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of Object.keys(e)) t.set(n, e[n]);
		return t;
	},
	addPair: (e, t, n) => {
		if (typeof t == "object" && t) return "object-based map does not support complex keys";
		let r = String(t);
		return r === "__proto__" ? Object.defineProperty(e, r, {
			value: n,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = n, "";
	},
	has: (e, t) => typeof t == "object" && t ? !1 : Object.prototype.hasOwnProperty.call(e, String(t)),
	keys: (e) => Object.keys(e),
	get: (e, t) => {
		let n = String(t);
		return Object.prototype.hasOwnProperty.call(e, n) ? e[n] : null;
	}
}), jt = we("tag:yaml.org,2002:set", {
	create: () => /* @__PURE__ */ new Set(),
	identify: (e) => e instanceof Set,
	represent: (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) t.set(n, null);
		return t;
	},
	addPair: (e, t, n) => n === null ? (e.add(t), "") : "cannot resolve a set item",
	has: (e, t) => e.has(t),
	keys: (e) => e.keys(),
	get: () => null
});
function Mt() {
	return {
		scalar: Object.create(null),
		sequence: Object.create(null),
		mapping: Object.create(null)
	};
}
function Nt() {
	return {
		scalar: [],
		sequence: [],
		mapping: []
	};
}
function Pt(e) {
	let t = [];
	for (let n of e) {
		let e = t.length;
		for (let r = 0; r < t.length; r++) {
			let i = t[r];
			if (i.nodeKind === n.nodeKind && i.tagName === n.tagName && i.matchByTagPrefix === n.matchByTagPrefix) {
				e = r;
				break;
			}
		}
		t[e] = n;
	}
	return t;
}
var Ft = class e {
	tags;
	implicitScalarTags;
	implicitScalarByFirstChar;
	implicitScalarAnyFirstChar;
	defaultScalarTag;
	defaultSequenceTag;
	defaultMappingTag;
	exact;
	prefix;
	constructor(e) {
		let t = Pt(e), n = [], r = Mt(), i = Nt();
		for (let e of t) {
			if (e.nodeKind === "scalar" && e.implicit) {
				if (e.matchByTagPrefix) throw Error("Implicit scalar tags cannot match by tag prefix");
				n.push(e);
			}
			switch (e.nodeKind) {
				case "scalar":
					e.matchByTagPrefix ? i.scalar.push(e) : r.scalar[e.tagName] = e;
					break;
				case "sequence":
					e.matchByTagPrefix ? i.sequence.push(e) : r.sequence[e.tagName] = e;
					break;
				case "mapping": e.matchByTagPrefix ? i.mapping.push(e) : r.mapping[e.tagName] = e;
			}
		}
		let a = n.filter((e) => e.implicitFirstChars === null), o = /* @__PURE__ */ new Set();
		for (let e of n) if (e.implicitFirstChars !== null) for (let t of e.implicitFirstChars) o.add(t);
		let s = /* @__PURE__ */ new Map();
		for (let e of o) s.set(e, n.filter((t) => t.implicitFirstChars === null || t.implicitFirstChars.indexOf(e) !== -1));
		let c = r.scalar["tag:yaml.org,2002:str"];
		if (!c) throw Error("schema does not define the default scalar tag (tag:yaml.org,2002:str)");
		this.tags = t, this.implicitScalarTags = n, this.implicitScalarByFirstChar = s, this.implicitScalarAnyFirstChar = a, this.defaultScalarTag = c, this.defaultSequenceTag = r.sequence["tag:yaml.org,2002:seq"], this.defaultMappingTag = r.mapping["tag:yaml.org,2002:map"], this.exact = r, this.prefix = i;
	}
	lookupScalarTag(e) {
		let t = this.exact.scalar[e];
		if (t) return t;
		for (let t of this.prefix.scalar) if (e.startsWith(t.tagName)) return t;
	}
	lookupSequenceTag(e) {
		let t = this.exact.sequence[e];
		if (t) return t;
		for (let t of this.prefix.sequence) if (e.startsWith(t.tagName)) return t;
	}
	lookupMappingTag(e) {
		let t = this.exact.mapping[e];
		if (t) return t;
		for (let t of this.prefix.mapping) if (e.startsWith(t.tagName)) return t;
	}
	resolveImplicitScalarTag(e) {
		let t = this.implicitScalarByFirstChar.get(e.charAt(0)) ?? this.implicitScalarAnyFirstChar;
		for (let n of t) {
			let t = n.resolve(e, !1, n.tagName);
			if (t !== D) return {
				value: t,
				tag: n
			};
		}
		let n = this.defaultScalarTag;
		return {
			value: n.resolve(e, !1, n.tagName),
			tag: n
		};
	}
	withTags(...t) {
		let n = [];
		for (let e of t) n = n.concat(e);
		return new e([...this.tags, ...n]);
	}
}, It = new Ft([
	Te,
	Tt,
	At
]);
new Ft([
	...It.tags,
	Oe,
	Ie,
	Ye,
	lt
]);
var Lt = new Ft([
	...It.tags,
	De,
	Ne,
	We,
	it
]);
new Ft([
	...It.tags,
	Ae,
	ze,
	$e,
	mt,
	wt,
	ht,
	yt,
	Ot,
	kt,
	jt
]).withTags({
	...$e,
	resolve: (e, t, n) => {
		let r = $e.resolve(e, t, n);
		return r === D ? We.resolve(e, t, n) : r;
	}
}, {
	...mt,
	resolve: (e, t, n) => {
		let r = mt.resolve(e, t, n);
		return r === D ? it.resolve(e, t, n) : r;
	}
}), we("tag:yaml.org,2002:map", {
	create: () => /* @__PURE__ */ new Map(),
	addPair: (e, t, n) => (e.set(t, n), ""),
	has: (e, t) => e.has(t),
	keys: (e) => e.keys(),
	get: (e, t) => e.get(t),
	identify: (e) => e instanceof Map || Et(e),
	represent: (e) => {
		if (e instanceof Map) return e;
		let t = /* @__PURE__ */ new Map(), n = e;
		for (let e of Object.keys(n)) t.set(e, n[e]);
		return t;
	}
});
function Rt(e) {
	if (Array.isArray(e)) {
		let t = Array.prototype.slice.call(e);
		for (let e = 0; e < t.length; e++) {
			if (Array.isArray(t[e])) return null;
			typeof t[e] == "object" && Object.prototype.toString.call(t[e]) === "[object Object]" && (t[e] = "[object Object]");
		}
		return String(t);
	}
	return typeof e == "object" && Object.prototype.toString.call(e) === "[object Object]" ? "[object Object]" : String(e);
}
we("tag:yaml.org,2002:map", {
	create: () => ({}),
	identify: Et,
	represent: (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of Object.keys(e)) t.set(n, e[n]);
		return t;
	},
	addPair: (e, t, n) => {
		let r = Rt(t);
		return r === null ? "nested arrays are not supported inside keys" : (r === "__proto__" ? Object.defineProperty(e, r, {
			value: n,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = n, "");
	},
	has: (e, t) => {
		let n = Rt(t);
		return n !== null && Object.prototype.hasOwnProperty.call(e, n);
	},
	keys: (e) => Object.keys(e),
	get: (e, t) => {
		let n = String(t);
		return Object.prototype.hasOwnProperty.call(e, n) ? e[n] : null;
	}
});
var zt = {
	maxLength: 79,
	indent: 1,
	linesBefore: 3,
	linesAfter: 2
};
function Bt(e, t, n, r, i) {
	let a = "", o = "", s = Math.floor(i / 2) - 1;
	return r - t > s && (a = " ... ", t = r - s + a.length), n - r > s && (o = " ...", n = r + s - o.length), {
		str: a + e.slice(t, n).replace(/\t/g, "→") + o,
		pos: r - t + a.length
	};
}
function Vt(e, t) {
	return " ".repeat(Math.max(t - e.length, 0)) + e;
}
function Ht(e, t) {
	if (!e.buffer) return null;
	let n = {
		...zt,
		...t
	}, r = /\r?\n|\r|\0/g, i = [0], a = [], o, s = -1;
	for (; o = r.exec(e.buffer);) a.push(o.index), i.push(o.index + o[0].length), e.position <= o.index && s < 0 && (s = i.length - 2);
	s < 0 && (s = i.length - 1);
	let c = "", l = Math.min(e.line + n.linesAfter, a.length).toString().length, u = n.maxLength - (n.indent + l + 3);
	for (let t = 1; t <= n.linesBefore && !(s - t < 0); t++) {
		let r = Bt(e.buffer, i[s - t], a[s - t], e.position - (i[s] - i[s - t]), u);
		c = `${" ".repeat(n.indent)}${Vt((e.line - t + 1).toString(), l)} | ${r.str}\n${c}`;
	}
	let d = Bt(e.buffer, i[s], a[s], e.position, u);
	c += `${" ".repeat(n.indent)}${Vt((e.line + 1).toString(), l)} | ${d.str}\n`, c += `${"-".repeat(n.indent + l + 3 + d.pos)}^\n`;
	for (let t = 1; t <= n.linesAfter && !(s + t >= a.length); t++) {
		let r = Bt(e.buffer, i[s + t], a[s + t], e.position - (i[s] - i[s + t]), u);
		c += `${" ".repeat(n.indent)}${Vt((e.line + t + 1).toString(), l)} | ${r.str}\n`;
	}
	return c.replace(/\n$/, "");
}
function Ut(e, t) {
	let n = "";
	return e.mark ? (e.mark.name && (n += `in "${e.mark.name}" `), n += `(${e.mark.line + 1}:${e.mark.column + 1})`, !t && e.mark.snippet && (n += `\n\n${e.mark.snippet}`), `${e.reason} ${n}`) : e.reason;
}
var k = class e extends Error {
	reason;
	mark;
	constructor(e, t) {
		super(), this.name = "YAMLException", this.reason = e, this.mark = t, this.message = Ut(this, !1), Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
	}
	toString(e) {
		return `${this.name}: ${Ut(this, e)}`;
	}
	static throwAt(t, n, r, i = "") {
		let a = 0, o = 0;
		for (let e = 0; e < n; e++) {
			let n = t.charCodeAt(e);
			n === 10 ? (a++, o = e + 1) : n === 13 && (a++, t.charCodeAt(e + 1) === 10 && e++, o = e + 1);
		}
		let s = {
			name: i,
			buffer: t,
			position: n,
			line: a,
			column: n - o
		};
		throw s.snippet = Ht(s), new e(r, s);
	}
}, A = {
	DOCUMENT: 1,
	SEQUENCE: 2,
	MAPPING: 3,
	SCALAR: 4,
	ALIAS: 5,
	POP: 6
}, j = {
	PLAIN: 1,
	SINGLE_QUOTED: 2,
	DOUBLE_QUOTED: 3,
	LITERAL_BLOCK: 4,
	FOLDED_BLOCK: 5
}, M = {
	BLOCK: 1,
	FLOW: 2
}, N = {
	CLIP: 1,
	STRIP: 2,
	KEEP: 3
}, Wt = -1;
function Gt(e) {
	switch (e) {
		case 48: return "\0";
		case 97: return "\x07";
		case 98: return "\b";
		case 116: return "	";
		case 9: return "	";
		case 110: return "\n";
		case 118: return "\v";
		case 102: return "\f";
		case 114: return "\r";
		case 101: return "\x1B";
		case 32: return " ";
		case 34: return "\"";
		case 47: return "/";
		case 92: return "\\";
		case 78: return "";
		case 95: return "\xA0";
		case 76: return "\u2028";
		case 80: return "\u2029";
		default: return "";
	}
}
var Kt = Array(256), qt = Array(256);
for (let e = 0; e < 256; e++) Kt[e] = +!!Gt(e), qt[e] = Gt(e);
function Jt(e) {
	return e <= 65535 ? String.fromCharCode(e) : String.fromCharCode((e - 65536 >> 10) + 55296, (e - 65536 & 1023) + 56320);
}
function Yt(e) {
	return e >= 48 && e <= 57 ? e - 48 : (e | 32) - 97 + 10;
}
function Xt(e) {
	return e === 120 ? 2 : e === 117 ? 4 : 8;
}
function Zt(e, t, n) {
	let r = 0;
	for (; t < n;) {
		let n = e.charCodeAt(t);
		if (n === 10) r++, t++;
		else if (n === 13) r++, t++, e.charCodeAt(t) === 10 && t++;
		else if (n === 32 || n === 9) t++;
		else break;
	}
	return {
		position: t,
		breaks: r
	};
}
function Qt(e) {
	return e === 1 ? " " : "\n".repeat(e - 1);
}
function $t(e, t, n) {
	let r = "", i = t, a = t, o = t;
	for (; i < n;) {
		let t = e.charCodeAt(i);
		if (t === 10 || t === 13) {
			r += e.slice(a, o);
			let t = Zt(e, i, n);
			r += Qt(t.breaks), i = a = o = t.position;
		} else i++, t !== 32 && t !== 9 && (o = i);
	}
	return r + e.slice(a, o);
}
function en(e, t, n) {
	let r = "", i = t, a = t, o = t;
	for (; i < n;) {
		let t = e.charCodeAt(i);
		if (t === 39) r += e.slice(a, i) + "'", i += 2, a = o = i;
		else if (t === 10 || t === 13) {
			r += e.slice(a, o);
			let t = Zt(e, i, n);
			r += Qt(t.breaks), i = a = o = t.position;
		} else i++, t !== 32 && t !== 9 && (o = i);
	}
	return r + e.slice(a, n);
}
function tn(e, t, n) {
	let r = "", i = t, a = t, o = t;
	for (; i < n;) {
		let t = e.charCodeAt(i);
		if (t === 92) {
			r += e.slice(a, i), i++;
			let t = e.charCodeAt(i);
			if (t === 10 || t === 13) i = Zt(e, i, n).position;
			else if (t < 256 && Kt[t]) r += qt[t], i++;
			else {
				let n = Xt(t), a = 0;
				for (; n > 0; n--) {
					i++;
					let t = Yt(e.charCodeAt(i));
					a = (a << 4) + t;
				}
				r += Jt(a), i++;
			}
			a = o = i;
		} else if (t === 10 || t === 13) {
			r += e.slice(a, o);
			let t = Zt(e, i, n);
			r += Qt(t.breaks), i = a = o = t.position;
		} else i++, t !== 32 && t !== 9 && (o = i);
	}
	return r + e.slice(a, n);
}
function nn(e, t, n, r, i, a) {
	let o = r < 0 ? 0 : r, s = e.slice(t, n).replace(/\r\n?/g, "\n"), c = s === "" ? [] : (s.endsWith("\n") ? s.slice(0, -1) : s).split("\n"), l = "", u = !1, d = 0, f = !1;
	for (let e of c) {
		let t = 0;
		for (; t < o && e.charCodeAt(t) === 32;) t++;
		if (r < 0 || t >= e.length) {
			d++;
			continue;
		}
		let n = e.slice(o), i = n.charCodeAt(0);
		a ? i === 32 || i === 9 ? (f = !0, l += "\n".repeat(u ? 1 + d : d)) : f ? (f = !1, l += "\n".repeat(d + 1)) : d === 0 ? u && (l += " ") : l += "\n".repeat(d) : l += "\n".repeat(u ? 1 + d : d), l += n, u = !0, d = 0;
	}
	return i === N.KEEP ? l += "\n".repeat(u ? 1 + d : d) : i !== N.STRIP && u && (l += "\n"), l;
}
function rn(e, t) {
	if (t.valueStart === Wt) return "";
	let { valueStart: n, valueEnd: r } = t;
	if (t.fast) return e.slice(n, r);
	switch (t.style) {
		case j.SINGLE_QUOTED: return en(e, n, r);
		case j.DOUBLE_QUOTED: return tn(e, n, r);
		case j.LITERAL_BLOCK: return nn(e, n, r, t.indent, t.chomping, !1);
		case j.FOLDED_BLOCK: return nn(e, n, r, t.indent, t.chomping, !0);
		default: return $t(e, n, r);
	}
}
var an = Object.assign(Object.create(null), {
	"!": "!",
	"!!": "tag:yaml.org,2002:"
});
function on(e, t) {
	if (e.startsWith("!<") && e.endsWith(">")) return decodeURIComponent(e.slice(2, -1));
	let n = e.indexOf("!", 1), r = n === -1 ? "!" : e.slice(0, n + 1), i = t?.[r] ?? an[r] ?? r;
	return decodeURIComponent(i) + decodeURIComponent(e.slice(r.length));
}
var P = -1, sn = "tag:yaml.org,2002:merge", cn = {
	filename: "",
	schema: Lt,
	json: !1,
	maxTotalMergeKeys: 1e4,
	maxAliases: -1
};
function ln(e) {
	return "tagStart" in e && e.tagStart !== P ? e.tagStart : "anchorStart" in e && e.anchorStart !== P ? e.anchorStart : "valueStart" in e && e.valueStart !== P ? e.valueStart : "start" in e ? e.start : 0;
}
function F(e, t) {
	k.throwAt(e.source, e.position, t, e.filename);
}
function un(e, t, n, r) {
	try {
		return n.finalize(r);
	} catch (n) {
		if (n instanceof k) throw n;
		k.throwAt(e.source, t, n instanceof Error ? n.message : String(n), e.filename);
	}
}
function dn(e, t) {
	let n = rn(e.source, t), r = t.tagStart === P ? "" : e.source.slice(t.tagStart, t.tagEnd), i = e.schema.defaultScalarTag;
	if (r !== "") {
		if (r === "!") return {
			value: n,
			tag: i
		};
		let t = on(r, e.tagHandlers), a = e.schema.lookupScalarTag(t);
		if (a) {
			let r = a.resolve(n, !0, t);
			return r === D && F(e, `cannot resolve a node with !<${t}> explicit tag`), {
				value: r,
				tag: a
			};
		}
		let o = e.schema.lookupMappingTag(t) ?? e.schema.lookupSequenceTag(t);
		if (o) {
			n !== "" && F(e, `cannot resolve a node with !<${t}> explicit tag`);
			let r = o.create(t);
			return {
				value: o.carrierIsResult ? r : un(e, e.position, o, r),
				tag: o
			};
		}
		F(e, `unknown scalar tag !<${t}>`);
	}
	return t.style === j.PLAIN ? e.schema.resolveImplicitScalarTag(n) : {
		value: i.resolve(n, !1, i.tagName),
		tag: i
	};
}
function fn(e, t, n) {
	let r = t.tagStart === P ? "" : e.source.slice(t.tagStart, t.tagEnd);
	return r === "" || r === "!" ? n : on(r, e.tagHandlers);
}
function pn(e) {
	return e.nodeKind === "mapping";
}
function mn(e) {
	e.totalMergeKeys++, e.maxTotalMergeKeys !== -1 && e.totalMergeKeys > e.maxTotalMergeKeys && F(e, `merge keys exceeded maxTotalMergeKeys (${e.maxTotalMergeKeys})`);
}
function hn(e, t, n, r) {
	mn(e);
	for (let i of r.keys(n)) {
		if (mn(e), t.tag.has(t.value, i)) continue;
		let a = t.tag.addPair(t.value, i, r.get(n, i));
		a && F(e, a), t.overridable ??= /* @__PURE__ */ new Set(), t.overridable.add(i);
	}
}
function gn(e, t, n, r) {
	if (e.position = t.keyPosition, pn(r)) hn(e, t, n, r);
	else if (r.nodeKind === "sequence" && Array.isArray(n)) {
		n.length > 100 && F(e, "abnormal merge sequence size");
		for (let r of n) {
			let n = e.nodeTags.get(r);
			n || F(e, "cannot merge mappings; the provided source object is unacceptable"), hn(e, t, r, n);
		}
	} else F(e, "cannot merge mappings; the provided source object is unacceptable");
}
function _n(e, t, n, r, i) {
	if (e.position = t.keyPosition, t.keyIsMerge) {
		gn(e, t, r, i);
		return;
	}
	!e.json && t.tag.has(t.value, n) && !t.overridable?.has(n) && F(e, "duplicated mapping key");
	let a = t.tag.addPair(t.value, n, r);
	a && F(e, a), t.overridable?.delete(n);
}
function vn(e, t, n) {
	let r = e.frames[e.frames.length - 1];
	if (r.kind === "document") r.value = t, r.hasValue = !0;
	else if (r.kind === "sequence") {
		pn(n) && e.nodeTags.set(t, n);
		let i = r.tag.addItem(r.value, t, r.index++);
		i && F(e, i);
	} else if (r.hasKey) {
		let i = r.key;
		r.key = void 0, r.hasKey = !1, _n(e, r, i, t, n);
	} else r.key = t, r.keyPosition = e.position, r.hasKey = !0, r.keyIsMerge = n.tagName === sn;
}
function yn(e, t, n, r, i) {
	if (t.anchorStart !== P) {
		let a = {
			value: n,
			tag: r,
			isValueFinal: i
		};
		return e.anchors.set(e.source.slice(t.anchorStart, t.anchorEnd), a), a;
	}
	return null;
}
function bn(e, t) {
	let n = {
		...cn,
		...t,
		events: e,
		documents: [],
		eventIndex: 0,
		position: 0,
		frames: [],
		anchors: /* @__PURE__ */ new Map(),
		nodeTags: /* @__PURE__ */ new Map(),
		tagHandlers: Object.create(null),
		totalMergeKeys: 0,
		aliasCount: 0
	};
	for (; n.eventIndex < n.events.length;) {
		let e = n.events[n.eventIndex++];
		switch (n.position = ln(e), e.type) {
			case A.DOCUMENT:
				n.anchors = /* @__PURE__ */ new Map(), n.nodeTags = /* @__PURE__ */ new Map(), n.aliasCount = 0, n.tagHandlers = Object.create(null);
				for (let t of e.directives) t.kind === "tag" && (n.tagHandlers[t.handle] = t.prefix);
				n.frames.push({
					kind: "document",
					position: n.position,
					value: void 0,
					hasValue: !1
				});
				break;
			case A.SCALAR: {
				let { value: t, tag: r } = dn(n, e);
				yn(n, e, t, r, !0), vn(n, t, r);
				break;
			}
			case A.SEQUENCE: {
				let t = fn(n, e, "tag:yaml.org,2002:seq"), r = n.schema.lookupSequenceTag(t);
				r || F(n, `unknown sequence tag !<${t}>`);
				let i = r.create(t), a = yn(n, e, i, r, r.carrierIsResult);
				n.frames.push({
					kind: "sequence",
					position: n.position,
					value: i,
					tag: r,
					anchor: a,
					index: 0
				});
				break;
			}
			case A.MAPPING: {
				let t = fn(n, e, "tag:yaml.org,2002:map"), r = n.schema.lookupMappingTag(t);
				r || F(n, `unknown mapping tag !<${t}>`);
				let i = r.create(t), a = yn(n, e, i, r, r.carrierIsResult);
				n.frames.push({
					kind: "mapping",
					position: n.position,
					value: i,
					tag: r,
					anchor: a,
					key: void 0,
					keyPosition: n.position,
					hasKey: !1,
					keyIsMerge: !1,
					overridable: null
				});
				break;
			}
			case A.ALIAS: {
				n.maxAliases !== -1 && ++n.aliasCount > n.maxAliases && F(n, `aliases exceeded maxAliases (${n.maxAliases})`);
				let t = n.source.slice(e.anchorStart, e.anchorEnd), r = n.anchors.get(t);
				r || F(n, `unidentified alias "${t}"`), r.isValueFinal || F(n, `recursive alias "${t}" is not supported for tag ${r.tag.tagName} because it uses finalize()`), vn(n, r.value, r.tag);
				break;
			}
			case A.POP: {
				let e = n.frames.pop();
				if (e.kind === "mapping" && e.hasKey && (n.position = e.keyPosition, F(n, "incomplete mapping pair in event stream")), e.kind === "document") n.documents.push(e.value);
				else {
					let t = e.tag.carrierIsResult ? e.value : un(n, e.position, e.tag, e.value);
					e.anchor && (e.anchor.value = t, e.anchor.isValueFinal = !0), vn(n, t, e.tag);
				}
				break;
			}
		}
	}
	return n.documents;
}
var I = -1, xn = Object.prototype.hasOwnProperty, L = 1, Sn = 2, Cn = 3, R = 4, wn = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, Tn = /[,\[\]{}]/, En = /^(?:!|!!|![0-9A-Za-z-]+!)$/, Dn = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$,_.!~*'()\[\]])`, On = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$.~*'()_])`, kn = RegExp(`^(?:${Dn})*$`), An = RegExp(`^(?:${On})+$`), jn = RegExp(`^(?:!(?:${Dn})*|${On}(?:${Dn})*)$`), Mn = {
	filename: "",
	maxDepth: 100
};
function Nn(e, t, n) {
	e.events.push({
		type: A.DOCUMENT,
		explicitStart: t,
		explicitEnd: n,
		directives: e.directives
	});
}
function Pn(e, t, n, r, i, a, o) {
	e.events.push({
		type: A.SEQUENCE,
		start: t,
		anchorStart: n,
		anchorEnd: r,
		tagStart: i,
		tagEnd: a,
		style: o
	});
}
function Fn(e, t, n, r, i, a, o) {
	e.events.push({
		type: A.MAPPING,
		start: t,
		anchorStart: n,
		anchorEnd: r,
		tagStart: i,
		tagEnd: a,
		style: o
	});
}
function In(e, t) {
	e.events.splice(t.eventsLength, 0, {
		type: A.MAPPING,
		start: t.position,
		anchorStart: I,
		anchorEnd: I,
		tagStart: I,
		tagEnd: I,
		style: M.FLOW
	});
}
function z(e, t, n, r, i, a, o, s, c = N.CLIP, l = -1, u = !1) {
	e.events.push({
		type: A.SCALAR,
		valueStart: t,
		valueEnd: n,
		anchorStart: r,
		anchorEnd: i,
		tagStart: a,
		tagEnd: o,
		style: s,
		chomping: c,
		indent: l,
		fast: u
	});
}
function Ln(e, t, n) {
	e.events.push({
		type: A.ALIAS,
		anchorStart: t,
		anchorEnd: n
	});
}
function B(e) {
	e.events.push({ type: A.POP });
}
function V(e) {
	z(e, I, I, I, I, I, I, j.PLAIN);
}
function Rn() {
	return {
		anchorStart: I,
		anchorEnd: I,
		tagStart: I,
		tagEnd: I
	};
}
function H(e) {
	return {
		position: e.position,
		line: e.line,
		lineStart: e.lineStart,
		lineIndent: e.lineIndent,
		firstTabInLine: e.firstTabInLine,
		eventsLength: e.events.length
	};
}
function U(e, t) {
	e.position = t.position, e.line = t.line, e.lineStart = t.lineStart, e.lineIndent = t.lineIndent, e.firstTabInLine = t.firstTabInLine, e.events.length = t.eventsLength;
}
function W(e, t) {
	k.throwAt(e.input.slice(0, e.length), e.position, t, e.filename);
}
function G(e) {
	return e === 10 || e === 13;
}
function K(e) {
	return e === 9 || e === 32;
}
function q(e) {
	return K(e) || G(e);
}
function J(e) {
	return e === 0 || q(e);
}
function Y(e) {
	return e === 44 || e === 91 || e === 93 || e === 123 || e === 125;
}
function zn(e) {
	return e >= 48 && e <= 57 ? e - 48 : -1;
}
function Bn(e) {
	if (e >= 48 && e <= 57) return e - 48;
	let t = e | 32;
	return t >= 97 && t <= 102 ? t - 97 + 10 : -1;
}
function Vn(e) {
	return e === 120 ? 2 : e === 117 ? 4 : e === 85 ? 8 : 0;
}
function Hn(e) {
	return e === 48 || e === 97 || e === 98 || e === 116 || e === 9 || e === 110 || e === 118 || e === 102 || e === 114 || e === 101 || e === 32 || e === 34 || e === 47 || e === 92 || e === 78 || e === 95 || e === 76 || e === 80;
}
function Un(e) {
	e.input.charCodeAt(e.position) === 10 ? e.position++ : (e.position++, e.input.charCodeAt(e.position) === 10 && e.position++), e.line++, e.lineStart = e.position, e.lineIndent = 0, e.firstTabInLine = -1;
}
function X(e, t) {
	let n = 0, r = e.input.charCodeAt(e.position), i = e.position === e.lineStart || q(e.input.charCodeAt(e.position - 1));
	for (; r !== 0;) {
		for (; K(r);) i = !0, r === 9 && e.firstTabInLine === -1 && (e.firstTabInLine = e.position), r = e.input.charCodeAt(++e.position);
		if (t && i && r === 35) do
			r = e.input.charCodeAt(++e.position);
		while (!G(r) && r !== 0);
		if (!G(r)) break;
		for (Un(e), n++, i = !0, r = e.input.charCodeAt(e.position); r === 32;) e.lineIndent++, r = e.input.charCodeAt(++e.position);
	}
	return n;
}
function Z(e, t = e.position) {
	let n = e.input.charCodeAt(t);
	if ((n === 45 || n === 46) && n === e.input.charCodeAt(t + 1) && n === e.input.charCodeAt(t + 2)) {
		let n = e.input.charCodeAt(t + 3);
		return n === 0 || q(n);
	}
	return !1;
}
function Wn(e) {
	e.position === e.lineStart && e.input.charCodeAt(e.position) === 65279 && (e.position++, e.lineStart = e.position);
}
function Gn(e) {
	if (e.position !== e.lineStart) return !1;
	if (Z(e)) return !0;
	if (e.input.charCodeAt(e.position) !== 65279) return !1;
	let t = H(e);
	Wn(e), X(e, !0);
	let n = e.input.charCodeAt(e.position), r = e.position === e.lineStart && (n === 37 || n === 45 && Z(e));
	return U(e, t), r;
}
function Kn(e) {
	let t = e.input.charCodeAt(e.position);
	for (; t !== 0 && !G(t);) t = e.input.charCodeAt(++e.position);
}
function qn(e, t, n) {
	wn.test(e.input.slice(t, n)) && W(e, "the stream contains non-printable characters");
}
function Jn(e, t, n) {
	if (e.input.charCodeAt(e.position) !== 33) return !1;
	t.tagStart !== I && W(e, "duplication of a tag property");
	let r = e.position, i = !1, a = !1, o = "!", s = e.input.charCodeAt(++e.position);
	s === 60 ? (i = !0, s = e.input.charCodeAt(++e.position)) : s === 33 && (a = !0, o = "!!", s = e.input.charCodeAt(++e.position));
	let c = e.position, l;
	if (i) {
		for (; s !== 0 && s !== 62;) s = e.input.charCodeAt(++e.position);
		s !== 62 && W(e, "unexpected end of the stream within a verbatim tag"), l = e.input.slice(c, e.position), e.position++;
	} else {
		for (; s !== 0 && !q(s) && !(n && Y(s));) s === 33 && (a ? W(e, "tag suffix cannot contain exclamation marks") : (o = e.input.slice(c - 1, e.position + 1), En.test(o) || W(e, "named tag handle cannot contain such characters"), a = !0, c = e.position + 1)), s = e.input.charCodeAt(++e.position);
		l = e.input.slice(c, e.position), Tn.test(l) && W(e, "tag suffix cannot contain flow indicator characters");
	}
	return l && !(i ? kn.test(l) : An.test(l)) && W(e, `tag name cannot contain such characters: ${l}`), !i && o !== "!" && o !== "!!" && !xn.call(e.tagHandlers, o) && W(e, `undeclared tag handle "${o}"`), t.tagStart = r, t.tagEnd = e.position, !0;
}
function Yn(e, t) {
	if (e.input.charCodeAt(e.position) !== 38) return !1;
	t.anchorStart !== I && W(e, "duplication of an anchor property"), e.position++;
	let n = e.position;
	for (; e.input.charCodeAt(e.position) !== 0 && !q(e.input.charCodeAt(e.position)) && !Y(e.input.charCodeAt(e.position));) e.position++;
	return e.position === n && W(e, "name of an anchor node must contain at least one character"), t.anchorStart = n, t.anchorEnd = e.position, !0;
}
function Xn(e, t) {
	if (e.input.charCodeAt(e.position) !== 42) return !1;
	(t.anchorStart !== I || t.tagStart !== I) && W(e, "alias node should not have any properties"), e.position++;
	let n = e.position;
	for (; e.input.charCodeAt(e.position) !== 0 && !q(e.input.charCodeAt(e.position)) && !Y(e.input.charCodeAt(e.position));) e.position++;
	return e.position === n && W(e, "name of an alias node must contain at least one character"), Ln(e, n, e.position), !0;
}
function Zn(e, t) {
	X(e, !1), e.lineIndent < t && W(e, "deficient indentation");
}
function Qn(e, t, n) {
	if (e.input.charCodeAt(e.position) !== 39) return !1;
	e.position++;
	let r = e.position, i = !0;
	for (; e.input.charCodeAt(e.position) !== 0;) {
		let a = e.input.charCodeAt(e.position);
		if (a === 39) {
			if (e.input.charCodeAt(e.position + 1) === 39) {
				i = !1, e.position += 2;
				continue;
			}
			let t = e.position;
			return e.position++, z(e, r, t, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, j.SINGLE_QUOTED, N.CLIP, -1, i), !0;
		}
		G(a) ? (i = !1, Zn(e, t)) : e.position === e.lineStart && Z(e) ? W(e, "unexpected end of the document within a single quoted scalar") : a !== 9 && a < 32 ? W(e, "expected valid JSON character") : e.position++;
	}
	W(e, "unexpected end of the stream within a single quoted scalar");
}
function $n(e, t, n) {
	if (e.input.charCodeAt(e.position) !== 34) return !1;
	e.position++;
	let r = e.position, i = !0;
	for (; e.input.charCodeAt(e.position) !== 0;) {
		let a = e.input.charCodeAt(e.position);
		if (a === 34) {
			let t = e.position;
			return e.position++, z(e, r, t, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, j.DOUBLE_QUOTED, N.CLIP, -1, i), !0;
		}
		if (a === 92) {
			i = !1;
			let n = e.input.charCodeAt(++e.position);
			if (G(n)) Zn(e, t);
			else if (Hn(n)) e.position++;
			else {
				let t = Vn(n);
				for (t === 0 && W(e, "unknown escape sequence"); t-- > 0;) e.position++, Bn(e.input.charCodeAt(e.position)) < 0 && W(e, "expected hexadecimal character");
				e.position++;
			}
		} else G(a) ? (i = !1, Zn(e, t)) : e.position === e.lineStart && Z(e) ? W(e, "unexpected end of the document within a double quoted scalar") : a !== 9 && a < 32 ? W(e, "expected valid JSON character") : e.position++;
	}
	W(e, "unexpected end of the stream within a double quoted scalar");
}
function er(e, t, n) {
	let r = e.input.charCodeAt(e.position), i = N.CLIP, a = -1, o = !1;
	if (r !== 124 && r !== 62) return !1;
	let s = r === 124 ? j.LITERAL_BLOCK : j.FOLDED_BLOCK;
	for (e.position++; e.input.charCodeAt(e.position) !== 0;) {
		let n = e.input.charCodeAt(e.position), r = zn(n);
		if (n === 43 || n === 45) i !== N.CLIP && W(e, "repeat of a chomping mode identifier"), i = n === 43 ? N.KEEP : N.STRIP, e.position++;
		else if (r >= 0) r === 0 && W(e, "bad explicit indentation width of a block scalar; it cannot be less than one"), o && W(e, "repeat of an indentation width identifier"), a = t + r - 1, o = !0, e.position++;
		else break;
	}
	let c = !1;
	for (; K(e.input.charCodeAt(e.position));) c = !0, e.position++;
	c && e.input.charCodeAt(e.position) === 35 && Kn(e), G(e.input.charCodeAt(e.position)) ? Un(e) : e.input.charCodeAt(e.position) !== 0 && W(e, "a line break is expected");
	let l = o ? a : -1, u = 0, d = e.position, f = e.position;
	for (; e.input.charCodeAt(e.position) !== 0;) {
		let n = e.position, r = 0;
		for (; e.input.charCodeAt(n + r) === 32;) r++;
		let i = e.input.charCodeAt(n + r);
		if (i === 0) {
			l >= 0 ? r > l && (f = n + r) : r > 0 && (f = n + r);
			break;
		}
		if (Gn(e)) break;
		if (!o && l === -1 && G(i) && (u = Math.max(u, r)), !o && l === -1 && !G(i) && (i === 9 && r < t && (e.position = n + r, W(e, "tab characters must not be used in indentation")), r < u && (e.position = n + r, W(e, "bad indentation of a mapping entry"))), l === -1 && i !== 0 && !G(i) && r < t) {
			e.lineIndent = r, e.position = n + r;
			break;
		}
		!o && i !== 0 && !G(i) && l === -1 && (l = r);
		let a = l === -1 ? t + 1 : l;
		if (i !== 0 && !G(i) && r < a) {
			e.lineIndent = r, e.position = n + r;
			break;
		}
		Kn(e), f = e.position, G(e.input.charCodeAt(e.position)) && (Un(e), f = e.position);
	}
	return qn(e, d, f), z(e, d, f, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, s, i, l), !0;
}
function tr(e, t) {
	let n = e.input.charCodeAt(e.position), r = t === L;
	if (n === 0 || q(n) || n === 35 || n === 38 || n === 42 || n === 33 || n === 124 || n === 62 || n === 39 || n === 34 || n === 37 || n === 64 || n === 96 || r && Y(n)) return !1;
	if (n === 63 || n === 45) {
		let t = e.input.charCodeAt(e.position + 1);
		if (J(t) || r && Y(t)) return !1;
	}
	return !0;
}
function nr(e, t, n, r) {
	if (!tr(e, n)) return !1;
	let i = e.position, a = e.position, o = e.input.charCodeAt(e.position), s = n === L, c = !1;
	for (; o !== 0 && !Gn(e);) {
		if (o === 58) {
			let t = e.input.charCodeAt(e.position + 1);
			if (J(t) || s && Y(t)) break;
		} else if (o === 35) {
			if (q(e.input.charCodeAt(e.position - 1))) break;
		} else if (s && Y(o)) break;
		else if (G(o)) {
			let n = e.position, r = e.line, i = e.lineStart, a = e.lineIndent;
			if (X(e, !1), e.lineIndent >= t) {
				c = !0, o = e.input.charCodeAt(e.position);
				continue;
			}
			e.position = n, e.line = r, e.lineStart = i, e.lineIndent = a;
			break;
		}
		K(o) || (a = e.position + 1), o = e.input.charCodeAt(++e.position);
	}
	return a !== i && (qn(e, i, a), z(e, i, a, r.anchorStart, r.anchorEnd, r.tagStart, r.tagEnd, j.PLAIN, N.CLIP, -1, !c), !0);
}
function Q(e, t) {
	let n = e.line;
	X(e, !0), (e.line > n && e.lineIndent < t || e.firstTabInLine !== -1 && e.lineIndent < t) && W(e, "deficient indentation");
}
function rr(e, t, n) {
	let r = e.input.charCodeAt(e.position), i = r === 123, a = e.position, o = !0;
	if (r !== 91 && r !== 123) return !1;
	let s = i ? 125 : 93;
	for (i ? Fn(e, a, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, M.FLOW) : Pn(e, a, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, M.FLOW), e.position++; e.input.charCodeAt(e.position) !== 0;) {
		Q(e, t);
		let n = e.input.charCodeAt(e.position);
		if (n === s) return e.position++, B(e), !0;
		o ? n === 44 && W(e, "expected the node content, but found ','") : W(e, "missed comma between flow collection entries");
		let r = !1, a = !1;
		n === 63 && q(e.input.charCodeAt(e.position + 1)) && (r = a = !0, e.position += 1, Q(e, t));
		let c = e.line, l = H(e), u = $(e, t, L, !1, !0);
		Q(e, t), n = e.input.charCodeAt(e.position), (i || a || e.line === c) && n === 58 ? (r = !0, e.position++, Q(e, t), i || In(e, l), u || V(e), $(e, t, L, !1, !0) || V(e), Q(e, t), i || B(e)) : i && r ? (u || V(e), V(e)) : i ? V(e) : r && (In(e, l), u || V(e), V(e), B(e)), n = e.input.charCodeAt(e.position), n === 44 ? (o = !0, e.position++) : o = !1;
	}
	W(e, "unexpected end of the stream within a flow collection");
}
function ir(e, t, n) {
	if (e.firstTabInLine !== -1 || e.input.charCodeAt(e.position) !== 45 || !J(e.input.charCodeAt(e.position + 1))) return !1;
	for (Pn(e, e.position, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, M.BLOCK); e.input.charCodeAt(e.position) === 45 && J(e.input.charCodeAt(e.position + 1));) {
		e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, W(e, "tab characters must not be used in indentation"));
		let n = e.line;
		e.position++;
		let r = X(e, !0) > 0;
		if (e.firstTabInLine !== -1 && e.input.charCodeAt(e.position) === 45 && J(e.input.charCodeAt(e.position + 1)) && W(e, "bad indentation of a sequence entry"), r && e.lineIndent <= t ? V(e) : $(e, t, Cn, !1, !0), X(e, !0), e.lineIndent < t || e.position >= e.length) break;
		e.lineIndent > t && W(e, "bad indentation of a sequence entry"), e.line === n && e.input.charCodeAt(e.position) === 45 && J(e.input.charCodeAt(e.position + 1)) && W(e, "bad indentation of a sequence entry");
	}
	return B(e), !0;
}
function ar(e, t, n, r) {
	let i = !1, a = !1, o = !1, s = !1;
	if (e.firstTabInLine !== -1) return !1;
	let c = e.input.charCodeAt(e.position);
	for (; c !== 0;) {
		!i && e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, W(e, "tab characters must not be used in indentation"));
		let l = e.input.charCodeAt(e.position + 1), u = e.line;
		if ((c === 63 || c === 58) && J(l)) o ||= (Fn(e, e.position, r.anchorStart, r.anchorEnd, r.tagStart, r.tagEnd, M.BLOCK), !0), c === 63 ? (i && V(e), a = !0, i = !0) : i ? i = !1 : (V(e), a = !0, i = !1), e.position += 1, s = !0;
		else {
			i &&= (V(e), !1);
			let t = H(e);
			if (!$(e, n, Sn, !1, !0)) break;
			if (e.line === u) {
				for (c = e.input.charCodeAt(e.position); K(c);) c = e.input.charCodeAt(++e.position);
				if (c === 58) {
					if (c = e.input.charCodeAt(++e.position), J(c) || W(e, "a whitespace character is expected after the key-value separator within a block mapping"), !o) {
						for (U(e, t), Fn(e, t.position, r.anchorStart, r.anchorEnd, r.tagStart, r.tagEnd, M.BLOCK), o = !0, $(e, n, Sn, !1, !0), c = e.input.charCodeAt(e.position); K(c);) c = e.input.charCodeAt(++e.position);
						e.position++;
					}
					a = !0, i = !1, s = !1;
				} else if (a) W(e, "expected ':' after a mapping key");
				else return r.anchorStart !== I || r.tagStart !== I ? (U(e, t), !1) : !0;
			} else if (a) W(e, "can not read a block mapping entry; a multiline key may not be an implicit key");
			else return r.anchorStart !== I || r.tagStart !== I ? (U(e, t), !1) : !0;
		}
		if ($(e, t, R, !0, s) && (s = !1), i || (s &&= (V(e), !1)), X(e, !0), c = e.input.charCodeAt(e.position), (e.line === u || e.lineIndent > t) && c !== 0) W(e, "bad indentation of a mapping entry");
		else if (e.lineIndent < t) break;
	}
	return a ? (i && V(e), o && B(e), !0) : !1;
}
function $(e, t, n, r, i, a = !0) {
	e.depth >= e.maxDepth && W(e, `nesting exceeded maxDepth (${e.maxDepth})`), e.depth++;
	let o = 1, s = !1, c = !1, l = null, u = Rn(), d = n === R || n === Cn, f = d, p = d;
	if (r && X(e, !0) && (s = !0, o = e.lineIndent > t ? 1 : e.lineIndent === t ? 0 : -1), o === 1) for (;;) {
		let r = e.input.charCodeAt(e.position), i = H(e);
		if (s && o !== 1 && (r === 33 || r === 38)) break;
		if (s && p && (u.tagStart !== I || u.anchorStart !== I) && (r === 33 || r === 38)) {
			let n = H(e), r = t + 1;
			if (ar(e, e.position - e.lineStart, r, u) && e.events[n.eventsLength]?.type === A.MAPPING) return e.depth--, !0;
			U(e, n);
		}
		if (s && (r === 33 && u.tagStart !== I || r === 38 && u.anchorStart !== I) || !Jn(e, u, n === L) && !Yn(e, u)) break;
		l === null && (l = i), X(e, !0) ? (s = !0, f = p, o = e.lineIndent > t ? 1 : e.lineIndent === t ? 0 : -1) : f = !1;
	}
	if (f &&= s || i, o === 1 || n === R) {
		let r = n === L || n === Sn ? t : t + 1, i = e.position - e.lineStart;
		if (o === 1) {
			if (f && (ir(e, i, u) || ar(e, i, r, u)) || rr(e, r, u)) c = !0;
			else {
				let t = e.input.charCodeAt(e.position);
				if (l !== null && a && p && !f && t !== 124 && t !== 62) {
					let t = H(e), n = l.position - l.lineStart;
					U(e, l), ar(e, n, r, Rn()) && e.events[t.eventsLength]?.type === A.MAPPING ? c = !0 : U(e, t);
				}
				!c && (d && er(e, r, u) || Qn(e, r, u) || $n(e, r, u) || Xn(e, u) || nr(e, r, n, u)) && (c = !0);
			}
		} else o === 0 && (c = f && ir(e, i, u));
	}
	return d &&= !c, !c && (u.anchorStart !== I || u.tagStart !== I || d) && (z(e, I, I, u.anchorStart, u.anchorEnd, u.tagStart, u.tagEnd, j.PLAIN), c = !0), e.depth--, c || u.anchorStart !== I || u.tagStart !== I;
}
function or(e) {
	if (e.lineIndent > 0 || e.input.charCodeAt(e.position) !== 37) return !1;
	e.position++;
	let t = e.position;
	for (; e.input.charCodeAt(e.position) !== 0 && !q(e.input.charCodeAt(e.position));) e.position++;
	let n = e.input.slice(t, e.position), r = [];
	for (n.length === 0 && W(e, "directive name must not be less than one character in length"); e.input.charCodeAt(e.position) !== 0 && !G(e.input.charCodeAt(e.position));) {
		for (; K(e.input.charCodeAt(e.position));) e.position++;
		if (e.input.charCodeAt(e.position) === 35 || G(e.input.charCodeAt(e.position)) || e.input.charCodeAt(e.position) === 0) break;
		let t = e.position;
		for (; e.input.charCodeAt(e.position) !== 0 && !q(e.input.charCodeAt(e.position));) e.position++;
		r.push(e.input.slice(t, e.position));
	}
	if (G(e.input.charCodeAt(e.position)) && Un(e), n === "YAML") {
		e.directives.some((e) => e.kind === "yaml") && W(e, "duplication of %YAML directive"), r.length !== 1 && W(e, "YAML directive accepts exactly one argument");
		let t = /^([0-9]+)\.([0-9]+)$/.exec(r[0]);
		t === null && W(e, "ill-formed argument of the YAML directive"), parseInt(t[1], 10) !== 1 && W(e, "unacceptable YAML version of the document"), e.directives.push({
			kind: "yaml",
			version: r[0]
		});
	} else if (n === "TAG") {
		r.length !== 2 && W(e, "TAG directive accepts exactly two arguments");
		let [t, n] = r;
		En.test(t) || W(e, "ill-formed tag handle (first argument) of the TAG directive"), xn.call(e.tagHandlers, t) && W(e, `there is a previously declared suffix for "${t}" tag handle`), jn.test(n) || W(e, "ill-formed tag prefix (second argument) of the TAG directive"), e.tagHandlers[t] = n, e.directives.push({
			kind: "tag",
			handle: t,
			prefix: n
		});
	}
	return !0;
}
function sr(e) {
	e.directives = [], e.tagHandlers = Object.create(null);
	let t = !1;
	for (X(e, !0); or(e);) t = !0, X(e, !0);
	let n = !1, r = !1, i = !0;
	if (e.lineIndent === 0 && e.input.charCodeAt(e.position) === 45 && e.input.charCodeAt(e.position + 1) === 45 && e.input.charCodeAt(e.position + 2) === 45 && J(e.input.charCodeAt(e.position + 3))) {
		n = !0;
		let t = e.line;
		e.position += 3, X(e, !0), i = e.line > t;
	} else t && W(e, "directives end mark is expected");
	let a = e.events.length;
	if (!n && e.position === e.lineStart && e.input.charCodeAt(e.position) === 46 && Z(e)) {
		e.position += 3, X(e, !0);
		return;
	}
	if (Nn(e, n, !1), $(e, e.lineIndent - 1, R, !1, i, i) || V(e), X(e, !0), e.position === e.lineStart && Z(e) && (r = e.input.charCodeAt(e.position) === 46, r)) {
		let t = e.line;
		e.position += 3, X(e, !0), e.line === t && e.position < e.length && W(e, "end of the stream or a document separator is expected");
	}
	let o = e.events[a];
	o?.type === A.DOCUMENT && (o.explicitEnd = r), B(e), !r && e.position < e.length && !Gn(e) && W(e, "end of the stream or a document separator is expected");
}
function cr(e, t) {
	let n = e.length, r = {
		...Mn,
		...t,
		input: `${e}\0`,
		length: n,
		position: 0,
		line: 0,
		lineStart: 0,
		lineIndent: 0,
		firstTabInLine: -1,
		depth: 0,
		directives: [],
		tagHandlers: Object.create(null),
		events: []
	}, i = e.indexOf("\0");
	for (i !== -1 && k.throwAt(e, i, "null byte is not allowed in input", r.filename); r.position < r.length && (Wn(r), X(r, !0), !(r.position >= r.length));) {
		let e = r.position;
		sr(r), r.position === e && 
		/* c8 ignore next */
		W(r, "can not read a document");
	}
	return r.events;
}
var lr = {
	...Mn,
	...cn
};
function ur(e, t = {}) {
	let n = {
		...lr,
		...t
	}, r = String(e), i = Object.keys(Mn), a = Object.keys(cn);
	return bn(cr(r, Dt(n, i)), {
		...Dt(n, a),
		source: r
	});
}
function dr(e, t) {
	let n = ur(e, t);
	if (n.length === 0) throw new k("expected a document, but the input is empty");
	if (n.length === 1) return n[0];
	throw new k("expected a single document in the stream, but found more");
}
function fr(e, t) {
	return !!(e & 1 << t);
}
var pr = {
	applyQuoteFlowKeysOption: hr,
	doubleQuoteForInvisibles: gr,
	doubleQuoteWhitespaceOnly: _r,
	applyForceQuotesOption: vr,
	tryLongOrMultilineAsBlock: yr,
	quoteInvalidPlain: br,
	fallbackToDoubleQuoted: xr
};
function mr(e) {
	return e.presenterOptions.quoteStyle === "single" && fr(e.allowedStylesMask, j.SINGLE_QUOTED) ? j.SINGLE_QUOTED : j.DOUBLE_QUOTED;
}
function hr(e) {
	e.presenterOptions.quoteFlowKeys && e.isKey && e.flowOnly && e.style === j.PLAIN && (e.style = j.DOUBLE_QUOTED);
}
function gr(e) {
	e.style === j.PLAIN && /[\t\x7F-\xA0\u2028\u2029\uFEFF\uFFFE\uFFFF]/.test(e.node.value) && (e.style = j.DOUBLE_QUOTED);
}
function _r(e) {
	e.style === j.PLAIN && /^\s+$/.test(e.node.value) && (e.style = j.DOUBLE_QUOTED);
}
function vr(e) {
	e.presenterOptions.forceQuotes && (e.isKey || e.style !== j.PLAIN || e.node.tag === e.presenterOptions.schema.defaultScalarTag.tagName && (e.style = e.node.value.includes("\n") ? j.DOUBLE_QUOTED : mr(e)));
}
function yr(e) {
	if (e.style !== j.PLAIN || e.isKey) return;
	let t = e.node.value, n = t.indexOf("\n") !== -1;
	if (!fr(e.allowedStylesMask, j.LITERAL_BLOCK)) {
		n && (e.style = j.DOUBLE_QUOTED);
		return;
	}
	let r = e.presenterOptions.lineWidth;
	if (r === -1) {
		n && (e.style = j.LITERAL_BLOCK);
		return;
	}
	let i = Math.max(Math.min(r, 40), r - e.shiftOfContent), a = 0, o = !1;
	for (; a <= t.length;) {
		let e = t.length, n = t.indexOf("\n", a);
		n !== -1 && (e = n);
		let r = t.slice(a, e);
		if (r.length > i && r[0] !== " " && / [^ \t]/.test(r) && (o = !0), n === -1) break;
		a = n + 1;
	}
	o ? e.style = j.FOLDED_BLOCK : n && (e.style = j.LITERAL_BLOCK);
}
function br(e) {
	e.style === j.PLAIN && !fr(e.allowedStylesMask, j.PLAIN) && (e.style = mr(e));
}
function xr(e) {
	fr(e.allowedStylesMask, e.style) || (e.style = j.DOUBLE_QUOTED);
}
var Sr = "[\\x09\\x0A\\x0D\\x20-\\x7E\\x85\\xA0-\\uD7FF\\uE000-\\uFFFD\\u{10000}-\\u{10FFFF}]", Cr = "[\\n\\r]", wr = "\\uFEFF", Tr = "[ \\t]", Er = `(?:(?!(?:${Cr}|${wr}))${Sr})`, Dr = `(?:(?!${Tr})${Er})`, Or = "[\\x09\\x20-\\uD7FF\\uE000-\\uFFFF\\u{10000}-\\u{10FFFF}]", kr = "[-?:,\\[\\]{}#&*!|>'\"%@`]", Ar = "[,\\[\\]{}]", jr = Dr, Mr = `(?:(?!${Ar})${Dr})`, Nr = `(?:(?:(?!${kr})${Dr})|[?:-](?=${jr}))`, Pr = `(?:(?:(?!${kr})${Dr})|[?:-](?=${Mr}))`, Fr = `(?:(?:(?![:#])${jr})|:(?=${jr}))#*`, Ir = `(?:(?:(?![:#])${Mr})|:(?=${Mr}))#*`, Lr = `(?:${Tr}*${Fr})*`, Rr = `(?:${Tr}*${Ir})*`, zr = `${Nr}#*${Lr}`, Br = `${Pr}#*${Rr}`, Vr = zr, Hr = Br, Ur = `\\n+${Fr}${Lr}`, Wr = `\\n+${Ir}${Rr}`, Gr = `${zr}(?:${Ur})*`, Kr = `${Br}(?:${Wr})*`;
RegExp(`^(?:${Gr})$`, "u"), RegExp(`^(?:${Kr})$`, "u"), RegExp(`^(?:${Vr})$`, "u"), RegExp(`^(?:${Hr})$`, "u"), RegExp(`^(?:${Or})*$`, "u"), RegExp(`^(?:${Or}|\\n)*$`, "u"), RegExp(`^(?:${Er}|\\n)*$`, "u"), Object.keys(pr).map((e) => Reflect.get(pr, e)), A.DOCUMENT, A.SEQUENCE, A.MAPPING, A.SCALAR, A.ALIAS, A.POP, j.PLAIN, j.SINGLE_QUOTED, j.DOUBLE_QUOTED, j.LITERAL_BLOCK, j.FOLDED_BLOCK, M.BLOCK, M.FLOW, N.CLIP, N.STRIP, N.KEEP;
var qr = /^\uFEFF?(?:---|= yaml =)[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.|= yaml =)[ \t]*(?:\r?\n|$)/;
function Jr(e) {
	return e.replace(/(^|\n)([ \t]*)\*(?=[ \t]+\S)/g, "$1$2-");
}
function Yr(e) {
	try {
		let t = Jr(e);
		if (!t.trim()) return {};
		let n = dr(t);
		return typeof n != "object" || !n || Array.isArray(n) ? {} : n;
	} catch {
		return null;
	}
}
function Xr(e) {
	let t = qr.exec(e);
	if (!t) return {
		attributes: {},
		body: e
	};
	let n = Yr(t[1] ?? "");
	return n == null ? {
		attributes: {},
		body: e
	} : {
		attributes: n,
		body: e.slice(t[0].length)
	};
}
Object.entries(n).forEach(([e, t]) => {
	_.registerLanguage(e, t);
});
var Zr = /"/g, Qr = /_/g, $r = /^h\d$/, ei = /<[^>]*>/g;
function ti(e) {
	return Se(e.replace(ei, ""));
}
var ni = /^<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/, ri = /^https?:\/\/mp\.weixin\.qq\.com/, ii = "{words} words, about {minutes} min read", ai = "References", oi = "\n    <style>\n      .preview-wrapper pre::before {\n        position: absolute;\n        top: 0;\n        right: 0;\n        color: #ccc;\n        text-align: center;\n        font-size: 0.8em;\n        padding: 5px 10px 0;\n        line-height: 15px;\n        height: 15px;\n        font-weight: 600;\n      }\n    </style>\n  ";
function si(e) {
	return e.map(([e, t, n]) => n === t ? `<code style="font-size: 90%; opacity: 0.6;">[${e}]</code>: <i style="word-break: break-all">${t}</i><br/>` : `<code style="font-size: 90%; opacity: 0.6;">[${e}]</code> ${t}: <i style="word-break: break-all">${n}</i><br/>`).join("\n");
}
function ci(e) {
	try {
		return (e.split("?")[0].split("#")[0].split("/").pop() || "").replace(/\.[^.]*$/, "");
	} catch {
		return "";
	}
}
function li(e, t, n, r = "") {
	let i = e.split("-");
	for (let e of i) {
		if (e === "alt" && t) return t;
		if (e === "title" && n) return n;
		if (e === "filename" && r) {
			let e = ci(r);
			if (e) return d(e);
		}
	}
	return "";
}
var ui = "<svg xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" x=\"0px\" y=\"0px\" width=\"45px\" height=\"13px\" viewBox=\"0 0 450 130\">\n    <ellipse cx=\"50\" cy=\"65\" rx=\"50\" ry=\"52\" stroke=\"rgb(220,60,54)\" stroke-width=\"2\" fill=\"rgb(237,108,96)\" />\n    <ellipse cx=\"225\" cy=\"65\" rx=\"50\" ry=\"52\" stroke=\"rgb(218,151,33)\" stroke-width=\"2\" fill=\"rgb(247,193,81)\" />\n    <ellipse cx=\"400\" cy=\"65\" rx=\"50\" ry=\"52\" stroke=\"rgb(27,161,37)\" stroke-width=\"2\" fill=\"rgb(100,200,86)\" />\n  </svg>";
function di(e, t) {
	let n = _.getLanguage(t), r = n ? t : "plaintext", i = e.split("\n"), a = i.map((e) => e[0]), o = i.map((e, t) => {
		let n = a[t];
		return n === "+" || n === "-" ? e.slice(1) : e;
	}), s = n ? _.highlight(o.join("\n"), { language: r }).value.split("\n") : o.map(d), c = i.map((e, t) => {
		let n = a[t], r = s[t] ?? "", i, o;
		return n === "+" ? (i = "background:rgba(80,200,80,.18);", o = "<span style=\"color:#52c41a;user-select:none;\">+</span>") : n === "-" ? (i = "background:rgba(255,80,80,.18);", o = "<span style=\"color:#ff4d4f;user-select:none;\">-</span>") : (i = "", o = "<span style=\"user-select:none;\"> </span>"), `<span style="display:block;${i}">${o}${r}</span>`;
	}).join("");
	return `<pre class="hljs code__pre">${`<span class="mac-sign" style="padding: 10px 14px 0;">${ui}</span>`}<code class="language-diff-${t}"><span class="code-block__inner" style="display:block">${c}</span></code></pre>`;
}
function fi(e) {
	try {
		let t = Xr(e), n = t.attributes, r = t.body;
		return {
			yamlData: n,
			markdownContent: r,
			readingTime: S(r)
		};
	} catch (t) {
		return console.error("Error parsing front-matter:", t), {
			yamlData: {},
			markdownContent: e,
			readingTime: S(e)
		};
	}
}
function pi(e = {}) {
	let n = [], v = 0, y = [], b = [], x = [], S = new ee();
	S.setOptions({ breaks: !0 });
	function te() {
		return e;
	}
	function C(e, t, n, r) {
		let i = n ?? e, a = `${e.replace(Qr, "-")}`, o = $r.test(i);
		return o && x.push({
			level: Number(i.slice(1)),
			text: ti(t)
		}), `<${i} class="${a}"${o ? " data-heading=\"true\"" : ""}${r ? ` style="${r}"` : ""}>${t}</${i}>`;
	}
	function ne(e, t) {
		let r = n.find(([, , e]) => e === t);
		return r ? r[0] : (n.push([
			++v,
			e,
			t
		]), v);
	}
	function re(e) {
		n.length = 0, v = 0, y.length = 0, b.length = 0, x.length = 0, w(e);
	}
	function w(t) {
		e = {
			...e,
			...t
		};
	}
	function ie(t, n) {
		return (e.countMessages?.summary || ii).split("{words}").join(String(t)).split("{minutes}").join(String(n));
	}
	function ae(t) {
		if (!e.countStatus || !t.words) return "";
		let n = Math.ceil(t.minutes);
		return `
      <blockquote class="md-blockquote">
        <p class="md-blockquote-p">${ie(t.words, n)}</p>
      </blockquote>
    `;
	}
	return S.use({ renderer: {
		heading({ tokens: e, depth: t }) {
			let n = this.parser.parseInline(e);
			return C(`h${t}`, n);
		},
		paragraph({ tokens: e }) {
			let t = this.parser.parseInline(e), n = t.includes("<figure") && t.includes("<img"), r = t.trim() === "", i = /^<section class="katex-block"[\s\S]*<\/section>\s*$/.test(t.trim());
			return n || r || i ? t : C("p", t);
		},
		blockquote({ tokens: e }) {
			return C("blockquote", this.parser.parse(e));
		},
		code({ text: n, lang: r = "" }) {
			let i = r.split(" ")[0];
			if (i.startsWith("diff-")) return di(n, i.slice(5));
			let a = _.getLanguage(i), o = t(n, a ? i : "plaintext", _, !!e.isShowLineNumber), s = `<span class="mac-sign" style="padding: 10px 14px 0;">${ui}</span>`, c = "";
			return !a && i !== "plaintext" && (c = ` data-language-pending="${i}" data-raw-code="${n.replace(Zr, "&quot;")}" data-show-line-number="${e.isShowLineNumber}"`), `<pre class="hljs code__pre">${s}${`<code class="language-${r}"${c}>${o}</code>`}</pre>`;
		},
		codespan({ text: e }) {
			return C("codespan", d(e), "code");
		},
		list({ ordered: e, items: t, start: n = 1 }) {
			y.push(e), b.push(Number(n));
			let r = t.map((e) => this.listitem(e)).join("");
			return y.pop(), b.pop(), C(e ? "ol" : "ul", r);
		},
		listitem(e) {
			let t = y[y.length - 1], n = b[b.length - 1];
			b[b.length - 1] = n + 1;
			let r = t ? `${n}. ` : "• ", i;
			try {
				i = this.parser.parseInline(e.tokens);
			} catch {
				i = this.parser.parse(e.tokens).replace(ni, "$1");
			}
			return C("listitem", `${r}${i}`, "li");
		},
		image({ href: t, title: n, text: r }) {
			let i = "", a = "", o = r, s = r.match(/\|(\d+)(?:x(\d+))?$/);
			s && (o = r.replace(/\|(\d+)(?:x(\d+))?$/, ""), i = s[1] ? ` width="${s[1]}"` : "", a = s[2] ? ` height="${s[2]}"` : "");
			let c = e.legend ? li(e.legend, o, n, t) : "", l = c ? C("figcaption", c) : "";
			return `<figure><img src="${t}"${n ? ` title="${n}"` : ""}${i}${a} alt="${o}"/>${l}</figure>`;
		},
		link({ href: t, title: n, text: r, tokens: i }) {
			let a = this.parser.parseInline(i);
			if (ri.test(t)) return `<a href="${t}" title="${n || r}">${a}</a>`;
			if (t === r) return a;
			if (e.citeStatus) {
				let e = ne(n || r, t);
				return `<a href="${t}" title="${n || r}">${a}<sup>[${e}]</sup></a>`;
			}
			return `<a href="${t}" title="${n || r}">${a}</a>`;
		},
		strong({ tokens: e }) {
			return C("strong", this.parser.parseInline(e));
		},
		em({ tokens: e }) {
			return C("em", this.parser.parseInline(e));
		},
		del({ tokens: e }) {
			return C("del", this.parser.parseInline(e));
		},
		table({ header: e, rows: t }) {
			return `
        <section style="max-width: 100%; overflow: auto; -webkit-overflow-scrolling: touch">
          <table class="preview-table">
            <thead>${e.map((e) => C("th", this.parser.parseInline(e.tokens), void 0, `text-align: ${e.align || "left"}`)).join("")}</thead>
            <tbody>${t.map((e) => C("tr", e.map((e) => this.tablecell(e)).join(""))).join("")}</tbody>
          </table>
        </section>
      `;
		},
		tablecell(e) {
			return C("td", this.parser.parseInline(e.tokens), void 0, `text-align: ${e.align || "left"}`);
		},
		hr(e) {
			let t = e.raw.trim(), n = "dash";
			return t.includes("*") ? n = "star" : t.includes("_") && (n = "underscore"), `<hr class="hr hr-${n}">`;
		}
	} }), S.use(i(() => e.components ?? l(), () => e.renderMessages)), S.use(o()), S.use(m({ resolveUrl: (t) => e.assetResolver?.(t) ?? "about:blank" })), S.use(u()), S.use(a()), S.use(g({})), S.use(f({
		nonStandard: !0,
		getKatexLoadingMessage: () => e.renderMessages?.katexLoading
	}, !0)), S.use(c()), S.use(r(() => ({
		themeMode: e.themeMode,
		diagramMessages: e.diagramMessages
	}))), S.use(h({
		inlineSvg: !0,
		getDiagramMessages: () => e.diagramMessages,
		getThemeMode: () => e.themeMode
	})), S.use(s(() => ({
		themeMode: e.themeMode,
		diagramMessages: e.diagramMessages
	}))), S.use(p()), {
		buildAddition: () => oi,
		buildFootnotes: () => n.length ? C("h4", e.renderMessages?.footnoteTitle || ai) + C("footnotes", si(n), "p") : "",
		setOptions: w,
		reset: re,
		parseFrontMatterAndContent: fi,
		renderMarkdownToHtml(e) {
			return S.parse(e);
		},
		buildReadingTime: ae,
		createContainer(e) {
			return C("container", e, "section");
		},
		getHeadings: () => [...x],
		getOpts: te
	};
}
var mi = /* @__PURE__ */ e({
	hljs: () => _,
	initRenderer: () => pi
});
export { mi as t };
