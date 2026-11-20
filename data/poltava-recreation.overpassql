[out:json][timeout:90];(
  nwr[leisure~"^(park|garden|nature_reserve|playground|recreation_ground|beach_resort|swimming_area)$"](49.5477254,34.4468326,49.6579108,34.6603407);
  nwr[tourism~"^(picnic_site|picnic_table)$"](49.5477254,34.4468326,49.6579108,34.6603407);
  nwr[landuse~"^(forest|village_green|grass|recreation_ground)$"](49.5477254,34.4468326,49.6579108,34.6603407);
  nwr[natural~"^(wood|beach)$"](49.5477254,34.4468326,49.6579108,34.6603407);
);out body center geom;
