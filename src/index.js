mapboxgl.accessToken = 'pk.eyJ1IjoicnVzc2JpZ2dzIiwiYSI6ImNpZXQ0andwaDAwNDhzcG0ycmp6YzlyZ3UifQ.NM3xVtCXK72k6Lg9o2DEMg';

var map = new mapboxgl.Map({
	container: 'map',
	style: 'mapbox://styles/mapbox/light-v9',
	center: [ -106.65, 35.15 ],
	zoom: 11
});

function coordsToGeoJSON(changesetId, coords) {
	let ring = coords.split(' ').map((f) => {
		return parseFloat(f);
	});

	let pairs = ring.reduce(function(result, value, index, array) {
		if (index % 2 === 0) {
			var foo = array.slice(index, index + 2);
			result.push([ foo[1], foo[0] ]);
		}
		return result;
	}, []);

	return {
		type: 'Feature',
		id: changesetId,
		properties: { changeset: changesetId },
		geometry: {
			type: 'Polygon',
			coordinates: [ pairs ]
		}
	};
}

class ChangeSet {
	constructor(elem, data) {
		this.elem = elem;
		this.data = data;
		this.update = this.update.bind(this);
		this.addEventListeners = this.addEventListeners.bind(this);
		this.update();
	}

	addEventListeners() {
		let changesetId = this.elem.getAttribute('data-changeset');
		this.elem.addEventListener('mouseenter', () => {
			map.setFeatureState({ source: 'polys', id: changesetId }, { hover: true });
		});
		this.elem.addEventListener('mouseleave', () => {
			map.setFeatureState({ source: 'polys', id: changesetId }, { hover: false });
		});
	}

	update() {
		const { changesetId, username, comment } = this.data;
		let changesetAnchor = document.createElement('a');
		changesetAnchor.href = `https://www.openstreetmap.org/changeset/${changesetId}`;
		changesetAnchor.innerText = `${changesetId}`;
		let usernameAnchor = document.createElement('a');
		usernameAnchor.href = `https://www.openstreetmap.org/user/${username}`;
		usernameAnchor.innerText = `${username}`;
		this.elem.setAttribute('data-changeset', changesetId);
		this.elem.innerHTML = `Changeset: ${changesetAnchor.outerHTML}<br>By: ${usernameAnchor.outerHTML}<br>Comment: ${comment}`;
	}
}

function parseItem(item) {
	let title = item.getElementsByTagName('title')[0].childNodes[0].nodeValue;
	let comment = item.getElementsByTagName('description')[0].childNodes[0].nodeValue.split('<br>')[0];
	let values = title.split(' by ');
	let username = values.pop();
	let changesetId = values.pop().split('Changeset ')[1];
	return {
		changesetId: changesetId,
		username: username,
		comment: comment
	};
}

async function getRSS() {
	let res = await fetch('https://osmcha.mapbox.com/api/v1/aoi/8755f992-d7e4-48f0-af7b-181b3f5b5241/changesets/feed/');
	let text = await res.text();
	return text;
}

getRSS().then((xmlData) => {
	const parser = new DOMParser();
	let xmlDoc = parser.parseFromString(xmlData, 'text/xml');
	let items = xmlDoc.querySelectorAll('rss > channel > item');
	let list = document.querySelector('.list');
	let features = [];
	let changeSets = [];
	let frag = document.createDocumentFragment();
	for (const item of items) {
		let poly = item.getElementsByTagName('georss:polygon');
		let div = document.createElement('div');
		div.classList.add('changeset');
		let data = parseItem(item);
		let changeSet = new ChangeSet(div, data);
		changeSet.update(data);
		changeSets.push(changeSet);
		frag.appendChild(div);
		let geoJSON = coordsToGeoJSON(data.changesetId, poly[0].innerHTML);
		features.push(geoJSON);
	}
	list.appendChild(frag);
	let fc = {
		type: 'FeatureCollection',
		features: features
	};

	let hoveredStateId = null;
	map.on('load', function() {
		map.resize();
		map.addSource('polys', {
			type: 'geojson',
			data: fc
		});

		map.addLayer({
			id: 'poly-fills',
			type: 'fill',
			source: 'polys',
			layout: {},
			paint: {
				'fill-color': [ 'case', [ 'boolean', [ 'feature-state', 'hover' ], false ], '#FF33F3', '#999' ],
				'fill-opacity': 0.4
			},
			filter: [ '==', '$type', 'Polygon' ]
		});
		map.addLayer({
			id: 'outline',
			type: 'line',
			source: 'polys',
			layout: {},
			paint: {
				'line-color': [ 'case', [ 'boolean', [ 'feature-state', 'hover' ], false ], '#FF33F3', '#999' ],
				'line-width': 2
			},
			filter: [ '==', '$type', 'Polygon' ]
		});

		for (const c of changeSets) {
			c.addEventListeners();
		}

		map.on('mousemove', 'poly-fills', (e) => {
			if (e.features.length > 0) {
				if (hoveredStateId) {
					map.setFeatureState({ source: 'polys', id: hoveredStateId }, { hover: false });
				}
				hoveredStateId = e.features[0].id;
				map.setFeatureState({ source: 'polys', id: hoveredStateId }, { hover: true });
				let item = document.querySelector(`[data-changeset="${hoveredStateId}"]`);
				item.classList.add('changeset--hover');
			}
		});

		map.on('mouseleave', 'poly-fills', function() {
			if (hoveredStateId) {
				map.setFeatureState({ source: 'polys', id: hoveredStateId }, { hover: false });
				let item = document.querySelector(`[data-changeset="${hoveredStateId}"]`);
				item.classList.remove('changeset--hover');
			}

			hoveredStateId = null;
		});
	});
});
